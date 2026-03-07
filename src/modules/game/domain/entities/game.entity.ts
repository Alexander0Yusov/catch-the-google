import { GameStatus } from "../enums/game-status.enum.js";
import {
  type DomainEvent,
  GameFinishedEvent,
  GameStartedEvent,
  GoogleCaughtEvent,
  GoogleJumpedEvent,
} from "../events/index.js";
import { type GridSize, validateGridSize } from "../types/grid-size.type.js";
import { type PlayerId, Player } from "./player.entity.js";
import {
  type PositionDelta,
  Position,
} from "../value-objects/position.value-object.js";
import {
  GooglePositionDomainService,
  type RandomIndexFn,
} from "../services/google-position.domain-service.js";

export type MoveDirection = "up" | "down" | "left" | "right";

export type GameSettings = Readonly<{
  pointsToWin: number;
  gridSize: GridSize;
  googleJumpInterval: number;
  gameDurationMs: number;
  firstTurnPlayerId: 1 | 2;
  turnDelayMs: number;
}>;

export type UpdateGameSettings = Readonly<Partial<{
  pointsToWin: number;
  gridSize: Partial<GridSize>;
  googleJumpInterval: number;
  gameDurationMs: number;
  firstTurnPlayerId: 1 | 2;
  turnDelayMs: number;
}>>;

type GameParams = Readonly<{
  gridSize: GridSize;
  player1Start: Position;
  player2Start: Position;
  googleStart: Position;
  settings?: UpdateGameSettings;
}>;

export class Game {
  private settings: GameSettings;
  private readonly player1: Player;
  private readonly player2: Player;
  private readonly domainEvents: DomainEvent[] = [];
  private googlePosition: Position;
  private status: GameStatus = GameStatus.Pending;

  constructor(params: GameParams) {
    validateGridSize(params.gridSize);

    const player1Start = Position.create(
      params.player1Start.x,
      params.player1Start.y,
      params.gridSize
    );
    const player2Start = Position.create(
      params.player2Start.x,
      params.player2Start.y,
      params.gridSize
    );
    const googleStart = Position.create(
      params.googleStart.x,
      params.googleStart.y,
      params.gridSize
    );

    if (player1Start.equals(player2Start)) {
      throw new Error("Players cannot start on the same cell");
    }

    if (googleStart.equals(player1Start) || googleStart.equals(player2Start)) {
      throw new Error("Google cannot start on a player cell");
    }

    this.settings = {
      pointsToWin: 10,
      gridSize: params.gridSize,
      googleJumpInterval: 2000,
      gameDurationMs: 120000,
      firstTurnPlayerId: 1,
      turnDelayMs: 250,
    };
    this.player1 = new Player(1, player1Start);
    this.player2 = new Player(2, player2Start);
    this.googlePosition = googleStart;

    if (params.settings) {
      this.setSettings(params.settings);
      this.clearDomainEvents();
    }
  }

  getStatus(): GameStatus {
    return this.status;
  }

  getPlayer(id: PlayerId): Player {
    return id === 1 ? this.player1 : this.player2;
  }

  getGooglePosition(): Position {
    return this.googlePosition;
  }

  getGridSize(): GridSize {
    return this.settings.gridSize;
  }

  getSettings(): GameSettings {
    return this.settings;
  }

  getScore(): Readonly<Record<PlayerId, { points: number }>> {
    return {
      1: { points: this.player1.points },
      2: { points: this.player2.points },
    };
  }

  getDomainEvents(): readonly DomainEvent[] {
    return this.domainEvents;
  }

  clearDomainEvents(): void {
    this.domainEvents.length = 0;
  }

  addEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  start(): void {
    this.status = GameStatus.InProgress;
    this.addEvent(new GameStartedEvent());
  }

  stop(): void {
    this.status = GameStatus.Stopped;
  }

  pause(): void {
    if (this.status !== GameStatus.InProgress) {
      return;
    }

    this.status = GameStatus.Paused;
  }

  resume(): void {
    if (this.status !== GameStatus.Paused) {
      return;
    }

    this.status = GameStatus.InProgress;
  }

  finish(winnerId: PlayerId | null): void {
    this.status = GameStatus.Finished;
    this.addEvent(new GameFinishedEvent(winnerId));
  }

  setSettings(nextSettings: UpdateGameSettings): void {
    const mergedGridSize = nextSettings.gridSize
      ? {
          columns: nextSettings.gridSize.columns ?? this.settings.gridSize.columns,
          rows: nextSettings.gridSize.rows ?? this.settings.gridSize.rows,
        }
      : this.settings.gridSize;

    validateGridSize(mergedGridSize);

    Position.create(this.player1.position.x, this.player1.position.y, mergedGridSize);
    Position.create(this.player2.position.x, this.player2.position.y, mergedGridSize);
    Position.create(this.googlePosition.x, this.googlePosition.y, mergedGridSize);

    this.settings = {
      pointsToWin: nextSettings.pointsToWin ?? this.settings.pointsToWin,
      gridSize: mergedGridSize,
      googleJumpInterval:
        nextSettings.googleJumpInterval ?? this.settings.googleJumpInterval,
      gameDurationMs: nextSettings.gameDurationMs ?? this.settings.gameDurationMs,
      firstTurnPlayerId:
        nextSettings.firstTurnPlayerId ?? this.settings.firstTurnPlayerId,
      turnDelayMs: nextSettings.turnDelayMs ?? this.settings.turnDelayMs,
    };
  }

  move(playerId: PlayerId, direction: MoveDirection): void {
    if (this.status !== GameStatus.InProgress) {
      throw new Error("Game must be in-progress to move");
    }

    const movingPlayer = this.getPlayer(playerId);
    const otherPlayer = this.getPlayer(playerId === 1 ? 2 : 1);

    movingPlayer.move(
      this.#directionToDelta(direction),
      this.settings.gridSize,
      [otherPlayer.position]
    );
  }

  catch(playerId: PlayerId): boolean {
    if (this.status !== GameStatus.InProgress) {
      throw new Error("Game must be in-progress to catch");
    }

    const player = this.getPlayer(playerId);

    if (!player.position.equals(this.googlePosition)) {
      return false;
    }

    player.addPoint();
    this.addEvent(
      new GoogleCaughtEvent(player.id, player.points, this.googlePosition)
    );
    this.jumpGoogle(this.#defaultRandomIndex);
    return true;
  }

  jumpGoogle(randomIndex: RandomIndexFn): Position {
    const previousGooglePosition = this.googlePosition;

    this.googlePosition = GooglePositionDomainService.nextPosition({
      gridSize: this.settings.gridSize,
      playerPositions: [this.player1.position, this.player2.position],
      currentGooglePosition: this.googlePosition,
      randomIndex,
    });
    this.addEvent(new GoogleJumpedEvent(previousGooglePosition, this.googlePosition));

    return this.googlePosition;
  }

  setGooglePosition(position: Position): void {
    const safePosition = Position.create(
      position.x,
      position.y,
      this.settings.gridSize
    );

    if (
      safePosition.equals(this.player1.position) ||
      safePosition.equals(this.player2.position)
    ) {
      throw new Error("Google cannot be placed on a player cell");
    }

    this.googlePosition = safePosition;
  }

  #directionToDelta(direction: MoveDirection): PositionDelta {
    if (direction === "up") {
      return { x: 0, y: -1 };
    }

    if (direction === "down") {
      return { x: 0, y: 1 };
    }

    if (direction === "left") {
      return { x: -1, y: 0 };
    }

    return { x: 1, y: 0 };
  }

  #defaultRandomIndex(maxExclusive: number): number {
    return Math.floor(Math.random() * maxExclusive);
  }
}
