// @ts-nocheck
/**
 * DEPLOY-CRITICAL FILE
 * --------------------
 * Этот слой отвечает за запись игровой телеметрии в Neon/PostgreSQL.
 * Если схема отсутствует, мы уходим в in-memory fallback без падения сервера.
 * Это критично для прод-доступности: игра должна работать даже при частичных проблемах БД.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class GameDb {
  constructor() {
    this.enabled = this.#hasDbConfig();
    this.autoRunMigrations = process.env.AUTO_RUN_MIGRATIONS === "true";
    this.schemaReady = false;
    this.persistenceDisabledReason = null;

    if (!this.enabled) {
      return;
    }

    this.pool = new Pool(this.#buildPoolConfig());
  }

  async init() {
    if (!this.enabled) {
      // БД необязательна для игрового цикла: в demo-режиме состояние держим в памяти.
      return;
    }

    if (this.autoRunMigrations) {
      const migrationPath = path.join(__dirname, "migrations", "001_init_2.sql");
      const sql = await readFile(migrationPath, "utf8");
      await this.pool.query(sql);
    }

    this.schemaReady = await this.#checkSchemaReady();

    if (!this.schemaReady) {
      this.persistenceDisabledReason =
        "Таблицы *_2 не найдены. Persistence отключен, игра продолжит работать в памяти.";
      // eslint-disable-next-line no-console
      console.warn(`[DB] ${this.persistenceDisabledReason}`);
    }
  }

  async saveSessionStart(snapshot) {
    if (!this.#canPersist() || !snapshot?.sessionId) {
      return;
    }

    await this.#safePersist(async () => this.pool.query(
      `
        INSERT INTO game_sessions_2 (session_token, status, settings_json)
        VALUES ($1, $2, $3)
        ON CONFLICT (session_token)
        DO UPDATE SET status = EXCLUDED.status, settings_json = EXCLUDED.settings_json
      `,
      [snapshot.sessionId, snapshot.status, snapshot.settings]
    ));

    await this.#safePersist(async () => {
      await this.#upsertScore(snapshot.sessionId, 1, snapshot.score?.[1]?.points ?? 0);
      await this.#upsertScore(snapshot.sessionId, 2, snapshot.score?.[2]?.points ?? 0);
    });
  }

  async saveCatchEvent(payload) {
    if (!this.#canPersist() || !payload?.sessionId) {
      return;
    }

    await this.#safePersist(async () => this.pool.query(
      `INSERT INTO game_events_2 (session_token, event_type, payload_json) VALUES ($1, $2, $3)`,
      [payload.sessionId, "google_caught", payload]
    ));

    await this.#safePersist(async () => {
      await this.#upsertScore(payload.sessionId, 1, payload.score?.[1]?.points ?? 0);
      await this.#upsertScore(payload.sessionId, 2, payload.score?.[2]?.points ?? 0);
    });
  }

  async saveSessionFinish(payload) {
    if (!this.#canPersist() || !payload?.sessionId) {
      return;
    }

    await this.#safePersist(async () => this.pool.query(
      `
        UPDATE game_sessions_2
        SET status = $2,
            finished_at = NOW(),
            winner_player_id = $3
        WHERE session_token = $1
      `,
      [payload.sessionId, "finished", payload.winnerId]
    ));

    await this.#safePersist(async () => this.pool.query(
      `INSERT INTO game_events_2 (session_token, event_type, payload_json) VALUES ($1, $2, $3)`,
      [payload.sessionId, "game_finished", payload]
    ));

    await this.#safePersist(async () => {
      await this.#upsertScore(payload.sessionId, 1, payload.score?.[1]?.points ?? 0);
      await this.#upsertScore(payload.sessionId, 2, payload.score?.[2]?.points ?? 0);
    });
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

  #canPersist() {
    return this.enabled && this.schemaReady;
  }

  async #safePersist(run) {
    if (!this.#canPersist()) {
      return;
    }

    try {
      await run();
    } catch (error) {
      if (error?.code === "42P01") {
        this.schemaReady = false;
        this.persistenceDisabledReason =
          "Persistence отключен: одна из таблиц *_2 отсутствует в БД.";
        // eslint-disable-next-line no-console
        console.warn(`[DB] ${this.persistenceDisabledReason}`);
        return;
      }

      throw error;
    }
  }

  async #checkSchemaReady() {
    const requiredTables = [
      "players_2",
      "game_sessions_2",
      "game_events_2",
      "scores_2",
    ];

    const result = await this.pool.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1)
      `,
      [requiredTables]
    );

    const existing = new Set(result.rows.map((row) => row.table_name));
    return requiredTables.every((tableName) => existing.has(tableName));
  }

  #hasDbConfig() {
    return Boolean(
      process.env.DATABASE_URL ||
        (process.env.POSTGRES_HOST &&
          process.env.POSTGRES_USER &&
          process.env.POSTGRES_PASSWORD &&
          process.env.POSTGRES_DATABASE)
    );
  }

  #buildPoolConfig() {
    const ssl = process.env.DB_SSL === "disable" ? false : { rejectUnauthorized: false };

    if (process.env.DATABASE_URL) {
      return {
        connectionString: process.env.DATABASE_URL,
        ssl,
      };
    }

    return {
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT || 5432),
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DATABASE,
      ssl,
    };
  }
}



