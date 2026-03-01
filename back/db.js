import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class GameDb {
  constructor() {
    this.enabled = Boolean(process.env.DATABASE_URL);

    if (!this.enabled) {
      return;
    }

    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === "disable" ? false : { rejectUnauthorized: false },
    });
  }

  async init() {
    if (!this.enabled) {
      // БД необязательна для игрового цикла: в demo-режиме состояние держим в памяти.
      return;
    }

    const migrationPath = path.join(__dirname, "migrations", "001_init_2.sql");
    const sql = await readFile(migrationPath, "utf8");

    await this.pool.query(sql);
  }

  async saveSessionStart(snapshot) {
    if (!this.enabled || !snapshot?.sessionId) {
      return;
    }

    await this.pool.query(
      `
        INSERT INTO game_sessions_2 (session_token, status, settings_json)
        VALUES ($1, $2, $3)
        ON CONFLICT (session_token)
        DO UPDATE SET status = EXCLUDED.status, settings_json = EXCLUDED.settings_json
      `,
      [snapshot.sessionId, snapshot.status, snapshot.settings]
    );

    await this.#upsertScore(snapshot.sessionId, 1, snapshot.score?.[1]?.points ?? 0);
    await this.#upsertScore(snapshot.sessionId, 2, snapshot.score?.[2]?.points ?? 0);
  }

  async saveCatchEvent(payload) {
    if (!this.enabled || !payload?.sessionId) {
      return;
    }

    await this.pool.query(
      `INSERT INTO game_events_2 (session_token, event_type, payload_json) VALUES ($1, $2, $3)`,
      [payload.sessionId, "google_caught", payload]
    );

    await this.#upsertScore(payload.sessionId, 1, payload.score?.[1]?.points ?? 0);
    await this.#upsertScore(payload.sessionId, 2, payload.score?.[2]?.points ?? 0);
  }

  async saveSessionFinish(payload) {
    if (!this.enabled || !payload?.sessionId) {
      return;
    }

    await this.pool.query(
      `
        UPDATE game_sessions_2
        SET status = $2,
            finished_at = NOW(),
            winner_player_id = $3
        WHERE session_token = $1
      `,
      [payload.sessionId, "finished", payload.winnerId]
    );

    await this.pool.query(
      `INSERT INTO game_events_2 (session_token, event_type, payload_json) VALUES ($1, $2, $3)`,
      [payload.sessionId, "game_finished", payload]
    );

    await this.#upsertScore(payload.sessionId, 1, payload.score?.[1]?.points ?? 0);
    await this.#upsertScore(payload.sessionId, 2, payload.score?.[2]?.points ?? 0);
  }

  async close() {
    if (!this.enabled) {
      return;
    }

    await this.pool.end();
  }

  async #upsertScore(sessionToken, playerId, points) {
    await this.pool.query(
      `
        INSERT INTO scores_2 (session_token, player_id, points)
        VALUES ($1, $2, $3)
        ON CONFLICT (session_token, player_id)
        DO UPDATE SET points = EXCLUDED.points, updated_at = NOW()
      `,
      [sessionToken, playerId, points]
    );
  }
}

