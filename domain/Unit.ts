import { Position } from "./Position.js";

export class Unit {
  position: Position;

  constructor(position: Position) {
    this.position = position;
  }

  toJSON(): { position: Position } {
    return {
      position: this.position,
    };
  }
}
