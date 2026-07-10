use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::models::PlayerInfo;

#[derive(Clone, Default)]
pub struct Hub {
    inner: Arc<Mutex<HubInner>>,
}

#[derive(Default)]
struct HubInner {
    rooms: HashMap<Uuid, Vec<mpsc::UnboundedSender<String>>>,
    games: HashMap<Uuid, Vec<mpsc::UnboundedSender<String>>>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage<T: Serialize> {
    Ready {
        user_id: Uuid,
    },
    RoomUpdated {
        room: T,
    },
    GameStarted {
        game: T,
    },
    GameState {
        game: T,
        moves: serde_json::Value,
        white_player: Option<PlayerInfo>,
        black_player: Option<PlayerInfo>,
    },
    MoveAccepted {
        game: T,
        move_record: serde_json::Value,
    },
    PlayerDisconnected {
        user_id: Uuid,
    },
    Error {
        message: String,
    },
    Pong,
}

impl Hub {
    pub fn subscribe_room(&self, room_id: Uuid) -> mpsc::UnboundedReceiver<String> {
        self.subscribe(|inner, tx| inner.rooms.entry(room_id).or_default().push(tx))
    }

    pub fn subscribe_game(&self, game_id: Uuid) -> mpsc::UnboundedReceiver<String> {
        self.subscribe(|inner, tx| inner.games.entry(game_id).or_default().push(tx))
    }

    pub fn broadcast_room<T: Serialize>(&self, room_id: Uuid, message: &ServerMessage<T>) {
        self.broadcast(|inner| inner.rooms.get_mut(&room_id), message);
    }

    pub fn broadcast_game<T: Serialize>(&self, game_id: Uuid, message: &ServerMessage<T>) {
        self.broadcast(|inner| inner.games.get_mut(&game_id), message);
    }

    fn subscribe<F>(&self, push: F) -> mpsc::UnboundedReceiver<String>
    where
        F: FnOnce(&mut HubInner, mpsc::UnboundedSender<String>),
    {
        let (tx, rx) = mpsc::unbounded_channel();
        let mut inner = self.inner.lock().expect("hub mutex poisoned");
        push(&mut inner, tx);

        rx
    }

    fn broadcast<F, T>(&self, get_subscribers: F, message: &ServerMessage<T>)
    where
        F: FnOnce(&mut HubInner) -> Option<&mut Vec<mpsc::UnboundedSender<String>>>,
        T: Serialize,
    {
        let Ok(payload) = serde_json::to_string(message) else {
            return;
        };

        let mut inner = self.inner.lock().expect("hub mutex poisoned");
        let Some(subscribers) = get_subscribers(&mut inner) else {
            return;
        };

        subscribers.retain(|subscriber| subscriber.send(payload.clone()).is_ok());
    }
}
