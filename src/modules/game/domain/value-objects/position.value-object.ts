import { type GridSize, validateGridSize } from "../types/grid-size.type.js";

export type PositionDelta = Readonly<{
  x: number;
  y: number;
}>;

export class Position {
  public readonly x: number;
  public readonly y: number;

  private constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  static create(x: number, y: number, gridSize: GridSize): Position {
    validateGridSize(gridSize);

    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      throw new Error("Position coordinates must be integers");
    }

    if (x < 1 || x > gridSize.columns || y < 1 || y > gridSize.rows) {
      throw new Error("Position is outside grid boundaries");
    }

    return new Position(x, y);
  }

  move(delta: PositionDelta, gridSize: GridSize): Position {
    return Position.create(this.x + delta.x, this.y + delta.y, gridSize);
  }

  equals(other: Position): boolean {
    return this.x === other.x && this.y === other.y;
  }
}
