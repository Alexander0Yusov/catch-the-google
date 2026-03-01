export class Position {
  readonly x: number;
  readonly y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  clone(): Position {
    return new Position(this.x, this.y);
  }

  equal(otherPosition: Position): boolean {
    return otherPosition.x === this.x && otherPosition.y === this.y;
  }

  toJSON(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }
}
