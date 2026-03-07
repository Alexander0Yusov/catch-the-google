import { type PlayerId } from "../entities/player.entity.js";
import { GameStatus } from "../enums/game-status.enum.js";

export class GameFinishedEvent {
  readonly name = "game-finished";

  constructor(
    public readonly winnerId: PlayerId | null,
    public readonly status: GameStatus = GameStatus.Finished,
    public readonly occurredAt: Date = new Date()
  ) {}
}
