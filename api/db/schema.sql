CREATE TYPE room_status AS ENUM ('waiting', 'playing', 'finished', 'cancelled');
CREATE TYPE room_visibility AS ENUM ('public', 'private');
CREATE TYPE game_status AS ENUM ('active', 'finished');
CREATE TYPE game_result AS ENUM ('white_win', 'black_win', 'draw');

CREATE TABLE users (
    id uuid PRIMARY KEY,
    username text NOT NULL UNIQUE,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    rating integer NOT NULL DEFAULT 1200,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status room_status NOT NULL DEFAULT 'waiting',
    visibility room_visibility NOT NULL DEFAULT 'public',
    rated boolean NOT NULL DEFAULT false,
    time_control_seconds integer NOT NULL DEFAULT 600,
    increment_seconds integer NOT NULL DEFAULT 0,
    white_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    black_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE games (
    id uuid PRIMARY KEY,
    room_id uuid NOT NULL UNIQUE REFERENCES rooms(id) ON DELETE CASCADE,
    white_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    black_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status game_status NOT NULL DEFAULT 'active',
    result game_result,
    result_reason text,
    fen text NOT NULL,
    pgn text NOT NULL DEFAULT '',
    side_to_move text NOT NULL DEFAULT 'white',
    move_count integer NOT NULL DEFAULT 0,
    white_clock_ms bigint NOT NULL,
    black_clock_ms bigint NOT NULL,
    last_move_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);

CREATE TABLE moves (
    id uuid PRIMARY KEY,
    game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    move_number integer NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    uci text NOT NULL,
    san text NOT NULL,
    fen_after text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (game_id, move_number)
);
