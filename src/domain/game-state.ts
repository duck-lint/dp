import { Board, CellState, makeBoard } from './puzzle';

export const GAME_DURATION_MS = 35 * 60 * 1000;
export const WRONG_MARK_PENALTY_MS = 3 * 60 * 1000;

export type Tool = 'fill' | 'cross';
export type MarkCommand = Tool | 'erase';
export type Mark = 'filled' | 'crossed' | 'unknown';

export type Action = { before: Board; after: Board };

export interface GameState {
  board: Board;
  /** Retained as a compatibility field for saved v1 games; desktop does not use it. */
  tool: Tool;
  history: Action[];
  future: Action[];
  startedAt: number | null;
  /** Remaining time at the last persisted timer checkpoint. */
  remainingMs: number;
  /** Total penalties already charged. Undo never refunds this value. */
  penaltyMs: number;
  /** Kept for compatibility with v1 completion records and consumers. */
  elapsedMs: number;
  completedAt: number | null;
  failedAt: number | null;
}

export const initialGame = (w: number, h: number): GameState => ({
  board: makeBoard(w, h),
  tool: 'fill',
  history: [],
  future: [],
  startedAt: null,
  remainingMs: GAME_DURATION_MS,
  penaltyMs: 0,
  elapsedMs: 0,
  completedAt: null,
  failedAt: null,
});

export const remainingAt = (state: GameState, now: number): number =>
  Math.max(
    0,
    state.remainingMs -
      (state.startedAt ? Math.max(0, now - state.startedAt) : 0),
  );

export const checkpointTimer = (state: GameState, now: number): GameState => {
  if (!state.startedAt || state.completedAt || state.failedAt) return state;
  const remainingMs = remainingAt(state, now);
  return {
    ...state,
    remainingMs,
    startedAt: now,
    failedAt: remainingMs === 0 ? now : null,
    elapsedMs: GAME_DURATION_MS - remainingMs,
  };
};

const nextMark = (current: CellState, mark: Mark): CellState =>
  current === mark ? 'unknown' : mark;

/**
 * Apply one direct board action. The solution is optional for compatibility
 * with callers that only need board transitions; gameplay supplies it so
 * wrong marks become explicit history/timing events.
 */
export const applyCell = (
  state: GameState,
  y: number,
  x: number,
  mark: MarkCommand = state.tool,
  solution?: string[],
  now = Date.now(),
  clearOnly?: 'filled' | 'crossed',
): GameState => {
  if (state.completedAt || state.failedAt || !state.board[y]?.[x]) return state;

  const settled = checkpointTimer(state, now);
  if (settled.startedAt && settled.remainingMs === 0) return settled;

  const target: Mark =
    mark === 'fill' ? 'filled' : mark === 'cross' ? 'crossed' : 'unknown';
  const current = settled.board[y][x];
  if (mark === 'erase' && clearOnly && current !== clearOnly) return settled;
  const value = nextMark(current, target);
  if (current === value) return settled;

  const board = settled.board.map((row) => [...row]);
  board[y][x] = value;
  const wrong =
    Boolean(solution) &&
    value !== 'unknown' &&
    ((value === 'filled' && solution?.[y]?.[x] !== '1') ||
      (value === 'crossed' && solution?.[y]?.[x] === '1'));
  const remainingMs = Math.max(
    0,
    settled.remainingMs - (wrong ? WRONG_MARK_PENALTY_MS : 0),
  );
  return {
    ...settled,
    board,
    history: [
      ...settled.history.slice(-199),
      { before: settled.board, after: board },
    ],
    future: [],
    startedAt: settled.startedAt ?? now,
    remainingMs,
    penaltyMs: settled.penaltyMs + (wrong ? WRONG_MARK_PENALTY_MS : 0),
    elapsedMs: GAME_DURATION_MS - remainingMs,
    failedAt: remainingMs === 0 ? now : null,
  };
};

export const undo = (state: GameState, now = Date.now()): GameState => {
  const settled = checkpointTimer(state, now);
  if (settled.failedAt || settled.completedAt) return settled;
  const action = settled.history.at(-1);
  return action
    ? {
        ...settled,
        board: action.before,
        history: settled.history.slice(0, -1),
        future: [...settled.future, action],
      }
    : settled;
};

export const redo = (state: GameState, now = Date.now()): GameState => {
  const settled = checkpointTimer(state, now);
  if (settled.failedAt || settled.completedAt) return settled;
  const action = settled.future.at(-1);
  return action
    ? {
        ...settled,
        board: action.after,
        history: [...settled.history, action],
        future: settled.future.slice(0, -1),
      }
    : settled;
};
