use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::models::PlayerInfo;

type Subscriptions = HashMap<Uuid, Vec<mpsc::UnboundedSender<String>>>;

#[derive(Clone, Default)]
pub struct Hub {
    inner: Arc<Mutex<HubInner>>,
}

#[derive(Default)]
struct HubInner {
    rooms: Subscriptions,
    games: Subscriptions,
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

impl<T: Serialize> ServerMessage<T> {
    pub(crate) fn to_json_string(&self) -> Option<String> {
        serde_json::to_string(self).ok()
    }
}

impl Hub {
    pub fn subscribe_room(&self, room_id: Uuid) -> mpsc::UnboundedReceiver<String> {
        let mut inner = self.inner.lock().expect("hub mutex poisoned");

        subscribe(&mut inner.rooms, room_id)
    }

    pub fn subscribe_game(&self, game_id: Uuid) -> mpsc::UnboundedReceiver<String> {
        let mut inner = self.inner.lock().expect("hub mutex poisoned");

        subscribe(&mut inner.games, game_id)
    }

    pub fn broadcast_room<T: Serialize>(&self, room_id: Uuid, message: &ServerMessage<T>) {
        let Some(payload) = message.to_json_string() else {
            return;
        };

        let mut inner = self.inner.lock().expect("hub mutex poisoned");

        broadcast(&mut inner.rooms, room_id, &payload);
    }

    pub fn broadcast_game<T: Serialize>(&self, game_id: Uuid, message: &ServerMessage<T>) {
        let Some(payload) = message.to_json_string() else {
            return;
        };

        let mut inner = self.inner.lock().expect("hub mutex poisoned");

        broadcast(&mut inner.games, game_id, &payload);
    }
}

fn subscribe(
    subscriptions: &mut Subscriptions,
    channel_id: Uuid,
) -> mpsc::UnboundedReceiver<String> {
    let (sender, receiver) = mpsc::unbounded_channel();

    subscriptions.entry(channel_id).or_default().push(sender);

    receiver
}

fn broadcast(subscriptions: &mut Subscriptions, channel_id: Uuid, payload: &str) {
    let Some(subscribers) = subscriptions.get_mut(&channel_id) else {
        return;
    };

    subscribers.retain(|subscriber| subscriber.send(payload.to_owned()).is_ok());
}
