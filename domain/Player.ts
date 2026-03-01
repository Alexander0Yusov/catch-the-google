import { Position } from "./Position.js";
import { Unit } from "./Unit.js";

export class Player extends Unit {
  readonly id: 1 | 2;

  constructor(id: 1 | 2, position: Position) {
    super(position);
    this.id = id;
  }

  override toJSON(): { id: 1 | 2; position: Position } {
    return {
      id: this.id,
      position: this.position,
    };
  }
}
