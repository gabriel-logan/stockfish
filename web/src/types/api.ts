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
  game_id: string;
  move_number: number;
  user_id: string;
  uci: string;
  san: string;
  fen_after: string;
  created_at: string;
}

export interface JoinMatchmakingResponse {
  matched: boolean;
  room: Room;
  game?: Game;
}

export interface JoinRoomResponse {
  room: Room;
  game?: Game;
}

export interface GameResponse {
  game: Game;
  moves: MoveRecord[];
}

export type ServerMessage =
  | { type: "ready"; userId: string }
  | { type: "room_updated"; room: Room }
  | { type: "game_started"; game: Game }
  | { type: "game_state"; game: Game; moves: MoveRecord[] }
  | { type: "move_accepted"; game: Game; move_record: MoveRecord }
  | { type: "error"; message: string }
  | { type: "pong" };
