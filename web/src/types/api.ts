export interface ApiUser {
  id: string;
  username: string;
  email: string;
  rating: number;
  createdAt: string;
}

export interface AuthResponse {
  user: ApiUser;
  accessToken: string;
  refreshToken: string;
}

export interface Room {
  id: string;
  ownerId: string;
  status: string;
  visibility: string;
  rated: boolean;
  timeControlSeconds: number;
  incrementSeconds: number;
  whiteUserId: string | null;
  blackUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Game {
  id: string;
  roomId: string;
  whiteUserId: string;
  blackUserId: string;
  status: string;
  result: string | null;
  resultReason: string | null;
  fen: string;
  pgn: string;
  sideToMove: string;
  moveCount: number;
  whiteClockMs: number;
  blackClockMs: number;
  lastMoveAt: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface MoveRecord {
  id: string;
  gameId: string;
  moveNumber: number;
  userId: string;
  uci: string;
  san: string;
  fenAfter: string;
  clockMs?: number | null;
  createdAt: string;
}

export interface SavedGame {
  id: string;
  name: string | null;
  pgn: string;
  date: string;
  result: string;
  opponent: string;
  opening: string | null;
  playerColor: "w" | "b";
  botElo: number | null;
  moves: number;
}

export interface CreateSavedGameRequest {
  name?: string;
  pgn: string;
  result: string;
  opponent: string;
  opening?: string;
  playerColor: "w" | "b";
  botElo?: number;
  moves: number;
}

export interface JoinMatchmakingResponse {
  matched: boolean;
  room: Room;
  game?: Game;
}

export interface MatchmakingOptions {
  rated: boolean;
  timeControlSeconds: number;
  incrementSeconds: number;
}

export interface JoinRoomResponse {
  room: Room;
  game?: Game;
}

export interface GameResponse {
  game: Game;
  moves: MoveRecord[];
}

export interface PlayerInfo {
  id: string;
  username: string;
  rating: number;
}

export type ServerMessage =
  | { type: "ready"; user_id: string }
  | { type: "room_updated"; room: Room }
  | { type: "game_started"; game: Game }
  | {
      type: "game_state";
      game: Game;
      moves: MoveRecord[];
      white_player: PlayerInfo | null;
      black_player: PlayerInfo | null;
    }
  | {
      type: "move_accepted";
      game: Game;
      move_record: MoveRecord;
      white_player: PlayerInfo | null;
      black_player: PlayerInfo | null;
    }
  | { type: "draw_offered"; user_id: string }
  | { type: "draw_offer_declined"; user_id: string }
  | { type: "player_disconnected"; user_id: string }
  | { type: "error"; message: string }
  | { type: "pong" };
