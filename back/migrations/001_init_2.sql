CREATE TABLE IF NOT EXISTS players_2 (
  id SMALLINT PRIMARY KEY,
  name TEXT NOT NULL
);

INSERT INTO players_2 (id, name)
VALUES (1, 'Player 1'), (2, 'Player 2')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS game_sessions_2 (
  id BIGSERIAL PRIMARY KEY,
  session_token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  winner_player_id SMALLINT,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT fk_winner_player_2 FOREIGN KEY (winner_player_id) REFERENCES players_2(id)
);

CREATE TABLE IF NOT EXISTS game_events_2 (
  id BIGSERIAL PRIMARY KEY,
  session_token TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_session_events_2 FOREIGN KEY (session_token) REFERENCES game_sessions_2(session_token) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scores_2 (
  id BIGSERIAL PRIMARY KEY,
  session_token TEXT NOT NULL,
  player_id SMALLINT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_token, player_id),
  CONSTRAINT fk_scores_session_2 FOREIGN KEY (session_token) REFERENCES game_sessions_2(session_token) ON DELETE CASCADE,
  CONSTRAINT fk_scores_player_2 FOREIGN KEY (player_id) REFERENCES players_2(id)
);

