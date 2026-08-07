import { Board, CellState, makeBoard } from './puzzle';
export type Tool = 'fill' | 'cross' | 'erase';
export type Action = { before: Board; after: Board };
export interface GameState {
  board: Board;
  tool: Tool;
  history: Action[];
  future: Action[];
  startedAt: number | null;
  elapsedMs: number;
  completedAt: number | null;
}
export const initialGame = (w: number, h: number): GameState => ({
  board: makeBoard(w, h),
  tool: 'fill',
  history: [],
  future: [],
  startedAt: null,
  elapsedMs: 0,
  completedAt: null,
});
export const applyCell = (
  state: GameState,
  y: number,
  x: number,
  tool = state.tool,
): GameState => {
  const next: CellState =
    tool === 'fill' ? 'filled' : tool === 'cross' ? 'crossed' : 'unknown';
  if (state.board[y]?.[x] === next) return state;
  const board = state.board.map((row) => [...row]);
  board[y][x] = next;
  return {
    ...state,
    board,
    history: [
      ...state.history.slice(-199),
      { before: state.board, after: board },
    ],
    future: [],
    startedAt: state.startedAt ?? Date.now(),
  };
};
export const undo = (s: GameState): GameState => {
  const a = s.history.at(-1);
  return a
    ? {
        ...s,
        board: a.before,
        history: s.history.slice(0, -1),
        future: [...s.future, a],
      }
    : s;
};
export const redo = (s: GameState): GameState => {
  const a = s.future.at(-1);
  return a
    ? {
        ...s,
        board: a.after,
        history: [...s.history, a],
        future: s.future.slice(0, -1),
      }
    : s;
};
