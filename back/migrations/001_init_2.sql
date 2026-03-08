-- Initial schema for Catch The Google persistence.

CREATE TABLE IF NOT EXISTS players_2 (
  id SMALLINT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_sessions_2 (
  session_token TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_events_2 (
  id BIGSERIAL PRIMARY KEY,
  session_token TEXT NOT NULL REFERENCES game_sessions_2(session_token) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scores_2 (
  session_token TEXT NOT NULL REFERENCES game_sessions_2(session_token) ON DELETE CASCADE,
  player_id SMALLINT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_token, player_id)
);
