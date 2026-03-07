import { Position } from "../value-objects/position.value-object.js";

export class GoogleJumpedEvent {
  readonly name = "google-jumped";

  constructor(
    public readonly from: Position,
    public readonly to: Position,
    public readonly occurredAt: Date = new Date()
  ) {}
}
