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
        white_player: Option<PlayerInfo>,
        black_player: Option<PlayerInfo>,
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

#[cfg(test)]
mod tests {
    use std::thread;

    use super::*;

    #[test]
    fn room_broadcast_reaches_only_the_selected_room() {
        let hub = Hub::default();
        let first_room = Uuid::new_v4();
        let second_room = Uuid::new_v4();
        let mut first_receiver = hub.subscribe_room(first_room);
        let mut second_receiver = hub.subscribe_room(second_room);

        hub.broadcast_room(first_room, &ServerMessage::<serde_json::Value>::Pong);

        assert_eq!(first_receiver.try_recv().unwrap(), r#"{"type":"pong"}"#);
        assert!(second_receiver.try_recv().is_err());
    }

    #[test]
    fn game_broadcast_removes_closed_subscribers() {
        let hub = Hub::default();
        let game_id = Uuid::new_v4();
        let closed_receiver = hub.subscribe_game(game_id);
        let mut active_receiver = hub.subscribe_game(game_id);

        drop(closed_receiver);
        hub.broadcast_game(game_id, &ServerMessage::<serde_json::Value>::Pong);

        assert_eq!(active_receiver.try_recv().unwrap(), r#"{"type":"pong"}"#);

        let inner = hub.inner.lock().unwrap();
        assert_eq!(inner.games.get(&game_id).unwrap().len(), 1);
    }

    #[test]
    #[ignore = "run separately under ThreadSanitizer"]
    fn concurrent_subscriptions_and_broadcasts_are_safe() {
        let hub = Hub::default();
        let room_id = Uuid::new_v4();
        let mut receivers = Vec::new();

        thread::scope(|scope| {
            let mut handles = Vec::new();

            for _ in 0..16 {
                let hub = hub.clone();
                handles.push(scope.spawn(move || hub.subscribe_room(room_id)));
            }

            for handle in handles {
                receivers.push(handle.join().unwrap());
            }
        });

        thread::scope(|scope| {
            for _ in 0..8 {
                let hub = hub.clone();
                scope.spawn(move || {
                    hub.broadcast_room(room_id, &ServerMessage::<serde_json::Value>::Pong);
                });
            }
        });

        for receiver in &mut receivers {
            let messages: Vec<_> = std::iter::from_fn(|| receiver.try_recv().ok()).collect();
            assert_eq!(messages.len(), 8);
        }
    }
}
