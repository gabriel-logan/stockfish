use actix_web::web;

use crate::{auth, games, rooms, saved_games, users, ws};

pub fn configure(config: &mut web::ServiceConfig) {
    config
        .route("/health", web::get().to(health))
        .route("/ws", web::get().to(ws::websocket))
        .service(
            web::scope("/auth")
                .route("/register", web::post().to(auth::register))
                .route("/login", web::post().to(auth::login))
                .route("/refresh", web::post().to(auth::refresh))
                .route("/logout", web::post().to(auth::logout)),
        )
        .route("/me", web::get().to(users::me))
        .service(
            web::scope("/rooms")
                .route("", web::post().to(rooms::create_room))
                .route("", web::get().to(rooms::list_rooms))
                .route("/{room_id}", web::get().to(rooms::get_room))
                .route("/{room_id}/join", web::post().to(rooms::join_room)),
        )
        .service(
            web::scope("/matchmaking")
                .route("/join", web::post().to(rooms::join_matchmaking))
                .route("/leave", web::post().to(rooms::leave_matchmaking)),
        )
        .service(
            web::scope("/games")
                .route("/{game_id}", web::get().to(games::get_game))
                .route("/{game_id}/resign", web::post().to(games::resign_game)),
        )
        .service(
            web::scope("/saved-games")
                .route("", web::get().to(saved_games::list_saved_games))
                .route("", web::post().to(saved_games::create_saved_game))
                .route(
                    "/{saved_game_id}",
                    web::patch().to(saved_games::rename_saved_game),
                )
                .route(
                    "/{saved_game_id}",
                    web::delete().to(saved_games::delete_saved_game),
                ),
        );
}

async fn health() -> web::Json<serde_json::Value> {
    web::Json(serde_json::json!({ "ok": true }))
}

#[cfg(test)]
mod tests {
    use actix_web::{App, http::StatusCode, test};

    use super::*;

    #[actix_web::test]
    async fn health_endpoint_returns_ok() {
        let app = test::init_service(App::new().configure(configure)).await;
        let request = test::TestRequest::get().uri("/health").to_request();

        let response = test::call_service(&app, request).await;

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            test::read_body_json::<serde_json::Value, _>(response).await,
            serde_json::json!({ "ok": true })
        );
    }
}
