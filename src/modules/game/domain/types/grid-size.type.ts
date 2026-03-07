export type GridSize = Readonly<{
  columns: number;
  rows: number;
}>;

export function validateGridSize(gridSize: GridSize): void {
  if (!Number.isInteger(gridSize.columns) || gridSize.columns < 1) {
    throw new Error("gridSize.columns must be a positive integer");
  }

  if (!Number.isInteger(gridSize.rows) || gridSize.rows < 1) {
    throw new Error("gridSize.rows must be a positive integer");
  }
}
