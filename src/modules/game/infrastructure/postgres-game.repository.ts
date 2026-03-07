import pg from "pg";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type IGameQueryRepository } from "../application/contracts/game-query.repository.js";
import { type IGameSessionRepository } from "../application/contracts/game-session.repository.js";
import { Game, type UpdateGameSettings } from "../domain/entities/game.entity.js";
import { GameStatus } from "../domain/enums/game-status.enum.js";
import { Position } from "../domain/value-objects/position.value-object.js";

const { Pool } = pg;

type PersistedGameState = Readonly<{
  settings: UpdateGameSettings & {
    gridSize: {
      columns: number;
      rows: number;
    };
  };
  player1: { x: number; y: number };
  player2: { x: number; y: number };
  google: { x: number; y: number };
  status: GameStatus;
  score: {
    1: { points: number };
    2: { points: number };
  };
}>;

@Injectable()
export class PostgresGameRepository
  implements IGameSessionRepository, IGameQueryRepository, OnModuleInit, OnModuleDestroy
{
  private readonly databaseUrl: string;
  private readonly enabled: boolean;
  private readonly pool?: pg.Pool;
  private schemaReady = false;
  private readonly inMemorySessions = new Map<string, Game>();

  constructor(private readonly configService: ConfigService) {
    this.databaseUrl = this.configService.get<string>("DATABASE_URL") ?? "";
    this.enabled = Boolean(this.databaseUrl);

    if (!this.enabled) {
      return;
    }

    this.pool = new Pool(this.#buildPoolConfig());
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled || !this.pool) {
      return;
    }

    try {
      this.schemaReady = await this.#checkSchemaReady();
    } catch {
      this.schemaReady = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.enabled || !this.pool) {
      return;
    }

    await this.pool.end();
  }

  async getById(gameId: string): Promise<Game | null> {
    const inMemoryGame = this.inMemorySessions.get(gameId);

    if (!this.#canPersist()) {
      return inMemoryGame ?? null;
    }

    const row = await this.#safeQuery<{
      status: string;
      settings_json: unknown;
    }>(
      `
        SELECT status, settings_json
        FROM game_sessions_2
        WHERE session_token = $1
        LIMIT 1
      `,
      [gameId]
    );

    if (!row) {
      return inMemoryGame ?? null;
    }

    const state = this.#readStateFromSettingsJson(row.settings_json);

    if (!state) {
      return inMemoryGame ?? null;
    }

    const game = this.#restoreGame(state, row.status as GameStatus);
    this.inMemorySessions.set(gameId, game);
    return game;
  }

  async save(gameId: string, game: Game): Promise<void> {
    this.inMemorySessions.set(gameId, game);

    if (!this.#canPersist()) {
      return;
    }

    const state = this.#serializeGame(game);
    const settingsJson = { state };

    await this.#safeExec(
      `
        INSERT INTO game_sessions_2 (session_token, status, settings_json)
        VALUES ($1, $2, $3)
        ON CONFLICT (session_token)
        DO UPDATE SET status = EXCLUDED.status, settings_json = EXCLUDED.settings_json
      `,
      [gameId, game.getStatus(), settingsJson]
    );

    await this.#upsertScore(gameId, 1, state.score[1].points);
    await this.#upsertScore(gameId, 2, state.score[2].points);
  }

  async #upsertScore(
    gameId: string,
    playerId: 1 | 2,
    points: number
  ): Promise<void> {
    await this.#safeExec(
      `
        INSERT INTO scores_2 (session_token, player_id, points)
        VALUES ($1, $2, $3)
        ON CONFLICT (session_token, player_id)
        DO UPDATE SET points = EXCLUDED.points, updated_at = NOW()
      `,
      [gameId, playerId, points]
    );
  }

  #serializeGame(game: Game): PersistedGameState {
    const player1 = game.getPlayer(1).position;
    const player2 = game.getPlayer(2).position;
    const google = game.getGooglePosition();
    const settings = game.getSettings();
    const score = game.getScore();

    return {
      settings: {
        pointsToWin: settings.pointsToWin,
        googleJumpInterval: settings.googleJumpInterval,
        gameDurationMs: settings.gameDurationMs,
        firstTurnPlayerId: settings.firstTurnPlayerId,
        turnDelayMs: settings.turnDelayMs,
        gridSize: {
          columns: settings.gridSize.columns,
          rows: settings.gridSize.rows,
        },
      },
      player1: { x: player1.x, y: player1.y },
      player2: { x: player2.x, y: player2.y },
      google: { x: google.x, y: google.y },
      status: game.getStatus(),
      score: {
        1: { points: score[1].points },
        2: { points: score[2].points },
      },
    };
  }

  #restoreGame(state: PersistedGameState, status: GameStatus): Game {
    const gridSize = state.settings.gridSize;
    const game = new Game({
      gridSize,
      player1Start: Position.create(state.player1.x, state.player1.y, gridSize),
      player2Start: Position.create(state.player2.x, state.player2.y, gridSize),
      googleStart: Position.create(state.google.x, state.google.y, gridSize),
      settings: state.settings,
    });

    this.#restoreScore(game, state.score[1].points, state.score[2].points);
    this.#restoreStatus(game, status);
    game.clearDomainEvents();

    return game;
  }

  #restoreScore(game: Game, player1Points: number, player2Points: number): void {
    for (let i = 0; i < Math.max(player1Points, 0); i += 1) {
      game.getPlayer(1).addPoint();
    }

    for (let i = 0; i < Math.max(player2Points, 0); i += 1) {
      game.getPlayer(2).addPoint();
    }
  }

  #restoreStatus(game: Game, status: GameStatus): void {
    if (status === GameStatus.InProgress) {
      game.start();
      game.clearDomainEvents();
      return;
    }

    if (status === GameStatus.Stopped || status === GameStatus.Paused) {
      game.stop();
      return;
    }

    if (status === GameStatus.Finished) {
      game.finish(null);
      game.clearDomainEvents();
    }
  }

  #readStateFromSettingsJson(settingsJson: unknown): PersistedGameState | null {
    if (!settingsJson || typeof settingsJson !== "object") {
      return null;
    }

    const maybeState = (settingsJson as { state?: unknown }).state;

    if (!maybeState || typeof maybeState !== "object") {
      return null;
    }

    return maybeState as PersistedGameState;
  }

  #canPersist(): boolean {
    return this.enabled && this.schemaReady && Boolean(this.pool);
  }

  async #safeQuery<T>(sql: string, values: unknown[]): Promise<T | null> {
    if (!this.pool) {
      return null;
    }

    try {
      const result = await this.pool.query(sql, values);
      return (result.rows[0] as T | undefined) ?? null;
    } catch (error) {
      this.#handleSchemaError(error);
      return null;
    }
  }

  async #safeExec(sql: string, values: unknown[]): Promise<void> {
    if (!this.pool) {
      return;
    }

    try {
      await this.pool.query(sql, values);
    } catch (error) {
      this.#handleSchemaError(error);
    }
  }

  #handleSchemaError(error: unknown): void {
    const pgError = error as { code?: string };

    if (pgError.code === "42P01") {
      this.schemaReady = false;
      return;
    }

    throw error;
  }

  async #checkSchemaReady(): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

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

  #buildPoolConfig(): pg.PoolConfig {
    const ssl = { rejectUnauthorized: false };

    return {
      connectionString: this.databaseUrl,
      ssl,
    };
  }
}
