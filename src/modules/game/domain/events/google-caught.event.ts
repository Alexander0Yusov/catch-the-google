import { type PlayerId } from "../entities/player.entity.js";
import { Position } from "../value-objects/position.value-object.js";

export class GoogleCaughtEvent {
  readonly name = "google-caught";

  constructor(
    public readonly playerId: PlayerId,
    public readonly playerPoints: number,
    public readonly googlePosition: Position,
    public readonly occurredAt: Date = new Date()
  ) {}
}
