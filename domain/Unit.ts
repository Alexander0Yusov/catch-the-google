// @ts-nocheck
export class Unit {
  constructor(position) {
    this.position = position;
  }

  toJSON() {
    return {
      position: this.position,
    };
  }
}


