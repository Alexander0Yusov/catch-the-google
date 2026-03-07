import { GameStatus } from "../enums/game-status.enum.js";

export class GameStartedEvent {
  readonly name = "game-started";

  constructor(
    public readonly status: GameStatus = GameStatus.InProgress,
    public readonly occurredAt: Date = new Date()
  ) {}
}
