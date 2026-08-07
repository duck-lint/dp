export interface PuzzleDefinition {
  schemaVersion: 1;
  id: string;
  sequenceNumber: number;
  publishDate: string;
  width: number;
  height: number;
  solution: string[];
  reveal: { title: string; description: string };
}
export type CellState = 'unknown' | 'filled' | 'crossed';
export type Board = CellState[][];
export const makeBoard = (width: number, height: number): Board =>
  Array.from({ length: height }, () => Array<CellState>(width).fill('unknown'));
export const isSolved = (p: PuzzleDefinition, board: Board): boolean =>
  p.solution.every((row, y) =>
    [...row].every(
      (value, x) => (value === '1') === (board[y]?.[x] === 'filled'),
    ),
  );
