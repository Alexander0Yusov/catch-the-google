// @ts-nocheck
import { Unit } from "./Unit.js";

export class Player extends Unit {
  constructor(id, position) {
    super(position);
    this.id = id;
  }

  toJSON() {
    return {
      id: this.id,
      position: this.position,
    };
  }
}


