use actix_web::web::Bytes;
use actix_web::{HttpRequest, HttpResponse, web};
use actix_ws::Message;
use serde::Deserialize;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::AppState;
use crate::auth::decode_access_token;
use crate::error::{ApiError, ApiResult};
use crate::games;
use crate::hub::ServerMessage;
use crate::models::TokenQuery;
use crate::rooms;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    JoinRoom { room_id: Uuid },
    JoinGame { game_id: Uuid },
    Move { game_id: Uuid, uci: String },
    Ping,
}

pub async fn websocket(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Payload,
    query: web::Query<TokenQuery>,
) -> ApiResult<HttpResponse> {
    let token = query.token.as_deref().ok_or(ApiError::Unauthorized)?;
    let user_id = decode_access_token(token, &state.config.jwt_secret)?;
    let (response, mut session, mut stream) = actix_ws::handle(&req, body)
        .map_err(|_| ApiError::BadRequest("invalid websocket".to_owned()))?;

    let state_for_task = state.get_ref().clone();

    actix_web::rt::spawn(async move {
        let ready = ServerMessage::<serde_json::Value>::Ready { user_id };
        send_json(&mut session, &ready).await;

        let mut current_game_id: Option<Uuid> = None;

        while let Some(Ok(message)) = stream.recv().await {
            match message {
                Message::Binary(bytes) => {
                    handle_binary(
                        &state_for_task,
                        user_id,
                        &mut session,
                        &bytes,
                        &mut current_game_id,
                    )
                    .await;
                }
                Message::Ping(bytes) if session.pong(&bytes).await.is_err() => {
                    return;
                }
                Message::Close(reason) => {
                    if let Some(game_id) = current_game_id {
                        broadcast_player_disconnected(&state_for_task, game_id, user_id);
                    }
                    let _ = session.close(reason).await;
                    return;
                }
                _ => {}
            }
        }

        if let Some(game_id) = current_game_id {
            broadcast_player_disconnected(&state_for_task, game_id, user_id);
        }

        let _ = session.close(None).await;
    });

    Ok(response)
}

async fn handle_binary(
    state: &AppState,
    user_id: Uuid,
    session: &mut actix_ws::Session,
    bytes: &[u8],
    current_game_id: &mut Option<Uuid>,
) {
    let result = match serde_json::from_slice::<ClientMessage>(bytes) {
        Ok(ClientMessage::JoinRoom { room_id }) => join_room_channel(state, session, room_id).await,
        Ok(ClientMessage::JoinGame { game_id }) => {
            match join_game_channel(state, user_id, session, game_id).await {
                Ok(()) => {
                    *current_game_id = Some(game_id);
                    Ok(())
                }
                Err(e) => Err(e),
            }
        }
        Ok(ClientMessage::Move { game_id, uci }) => play_move(state, user_id, game_id, &uci).await,
        Ok(ClientMessage::Ping) => {
            send_json(session, &ServerMessage::<serde_json::Value>::Pong).await;
            Ok(())
        }
        Err(_) => Err(ApiError::BadRequest("invalid websocket message".to_owned())),
    };

    if let Err(error) = result {
        send_json(
            session,
            &ServerMessage::<serde_json::Value>::Error {
                message: error.to_string(),
            },
        )
        .await;
    }
}

fn broadcast_player_disconnected(state: &AppState, game_id: Uuid, user_id: Uuid) {
    let message = ServerMessage::<serde_json::Value>::PlayerDisconnected { user_id };

    state.hub.broadcast_game(game_id, &message);
}

fn forward_hub_messages(
    mut session: actix_ws::Session,
    mut messages: mpsc::UnboundedReceiver<String>,
) {
    actix_web::rt::spawn(async move {
        while let Some(payload) = messages.recv().await {
            if session.binary(Bytes::from(payload)).await.is_err() {
                return;
            }
        }
    });
}

async fn join_room_channel(
    state: &AppState,
    session: &mut actix_ws::Session,
    room_id: Uuid,
) -> ApiResult<()> {
    let room = rooms::get_room_by_id(state, room_id).await?;
    let messages = state.hub.subscribe_room(room_id);

    forward_hub_messages(session.clone(), messages);

    send_json(session, &ServerMessage::RoomUpdated { room }).await;

    Ok(())
}

async fn join_game_channel(
    state: &AppState,
    user_id: Uuid,
    session: &mut actix_ws::Session,
    game_id: Uuid,
) -> ApiResult<()> {
    let game = games::get_game_by_id(state, game_id).await?;
    games::ensure_player(&game, user_id)?;

    let moves = games::list_moves(state, game_id).await?;
    let (white_player, black_player) = games::fetch_game_players(state, &game).await;

    let messages = state.hub.subscribe_game(game_id);

    forward_hub_messages(session.clone(), messages);

    send_json(
        session,
        &ServerMessage::GameState {
            game,
            moves: serde_json::json!(moves),
            white_player,
            black_player,
        },
    )
    .await;

    Ok(())
}

async fn play_move(state: &AppState, user_id: Uuid, game_id: Uuid, uci: &str) -> ApiResult<()> {
    let (game, move_record) = games::play_uci_move(state, user_id, game_id, uci).await?;
    let message = ServerMessage::MoveAccepted {
        game: game.clone(),
        move_record: serde_json::json!(move_record),
    };

    state.hub.broadcast_game(game.id, &message);

    Ok(())
}

async fn send_json<T: serde::Serialize>(
    session: &mut actix_ws::Session,
    message: &ServerMessage<T>,
) {
    let Some(payload) = message.to_json_string() else {
        return;
    };

    let _ = session.binary(Bytes::from(payload)).await;
}
