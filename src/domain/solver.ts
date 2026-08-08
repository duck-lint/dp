import { countSolutions, type CardinalityResult } from './puzzle-analysis';
export type SolverResult = CardinalityResult;
export function solvePicross(
  rowClues: number[][],
  colClues: number[][],
): SolverResult {
  return countSolutions(rowClues, colClues);
}
