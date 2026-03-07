import { type GridSize } from "../types/grid-size.type.js";
import {
  type PositionDelta,
  Position,
} from "../value-objects/position.value-object.js";

export type PlayerId = 1 | 2;

export class Player {
  public readonly id: PlayerId;
  private _position: Position;
  private _points = 0;

  constructor(id: PlayerId, position: Position) {
    this.id = id;
    this._position = position;
  }

  get position(): Position {
    return this._position;
  }

  get points(): number {
    return this._points;
  }

  move(delta: PositionDelta, gridSize: GridSize, occupied: readonly Position[]): void {
    const next = this._position.move(delta, gridSize);
    const isOccupied = occupied.some((position) => position.equals(next));

    if (isOccupied) {
      throw new Error("Target cell is occupied");
    }

    this._position = next;
  }

  addPoint(): void {
    this._points += 1;
  }
}
