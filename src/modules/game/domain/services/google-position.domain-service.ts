import { type GridSize } from "../types/grid-size.type.js";
import { Position } from "../value-objects/position.value-object.js";

export type RandomIndexFn = (maxExclusive: number) => number;

type GoogleJumpParams = Readonly<{
  gridSize: GridSize;
  playerPositions: readonly Position[];
  currentGooglePosition: Position;
  randomIndex: RandomIndexFn;
}>;

export class GooglePositionDomainService {
  static nextPosition(params: GoogleJumpParams): Position {
    const excluded = [...params.playerPositions, params.currentGooglePosition];
    const availableWithoutCurrent = this.#getAvailablePositions(
      params.gridSize,
      excluded
    );

    // Fallback for very small grids: allow keeping previous google position.
    const available = availableWithoutCurrent.length > 0
      ? availableWithoutCurrent
      : this.#getAvailablePositions(params.gridSize, params.playerPositions);

    if (available.length === 0) {
      throw new Error("No available cells for google position");
    }

    const index = params.randomIndex(available.length);

    if (!Number.isInteger(index) || index < 0 || index >= available.length) {
      throw new Error("randomIndex returned out-of-range value");
    }

    return available[index];
  }

  static #getAvailablePositions(
    gridSize: GridSize,
    excludedPositions: readonly Position[]
  ): Position[] {
    const positions: Position[] = [];

    for (let x = 1; x <= gridSize.columns; x += 1) {
      for (let y = 1; y <= gridSize.rows; y += 1) {
        const nextPosition = Position.create(x, y, gridSize);
        const isExcluded = excludedPositions.some((position) =>
          position.equals(nextPosition)
        );

        if (!isExcluded) {
          positions.push(nextPosition);
        }
      }
    }

    return positions;
  }
}
