import {
  GAME_DURATION_MS,
  initialGame,
  type GameState,
} from '../domain/game-state';
import type { PuzzleDefinition } from '../domain/puzzle';
import { Completion } from '../domain/statistics';
const KEY = 'daily-picross:v1';
export interface SavedData {
  puzzles: Record<string, GameState>;
  completions: Completion[];
  theme: 'system' | 'light' | 'dark';
}
export const emptySaved = (): SavedData => ({
  puzzles: {},
  completions: [],
  theme: 'system',
});

const cellStates = new Set(['unknown', 'filled', 'crossed']);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const hasBoardShape = (
  board: unknown,
  puzzle: PuzzleDefinition,
): board is GameState['board'] =>
  Array.isArray(board) &&
  board.length === puzzle.height &&
  board.every(
    (row) =>
      Array.isArray(row) &&
      row.length === puzzle.width &&
      row.every((cell) => cellStates.has(cell)),
  );

const hasActionBoards = (
  actions: unknown,
  puzzle: PuzzleDefinition,
): actions is GameState['history'] =>
  Array.isArray(actions) &&
  actions.every(
    (action) =>
      action &&
      typeof action === 'object' &&
      hasBoardShape((action as GameState['history'][number]).before, puzzle) &&
      hasBoardShape((action as GameState['history'][number]).after, puzzle),
  );

/**
 * A saved board is subordinate to the authored puzzle. Never infer the
 * current puzzle's dimensions from persisted data.
 */
export const isCompatibleSavedState = (
  value: unknown,
  puzzle: PuzzleDefinition,
): boolean =>
  Boolean(
    value &&
    typeof value === 'object' &&
    hasBoardShape((value as GameState).board, puzzle),
  );

const reconcilePuzzleState = (
  value: unknown,
  puzzle: PuzzleDefinition,
): GameState | undefined => {
  if (!isCompatibleSavedState(value, puzzle)) return undefined;
  const old = value as Partial<GameState>;
  const fallback = initialGame(puzzle.width, puzzle.height);
  const legacyElapsed = isFiniteNumber(old.elapsedMs) ? old.elapsedMs : 0;
  const remainingMs = isFiniteNumber(old.remainingMs)
    ? Math.max(0, Math.min(GAME_DURATION_MS, old.remainingMs))
    : Math.max(0, GAME_DURATION_MS - legacyElapsed);
  return {
    ...fallback,
    ...old,
    board: (value as { board: GameState['board'] }).board,
    history: hasActionBoards(old.history, puzzle) ? old.history : [],
    future: hasActionBoards(old.future, puzzle) ? old.future : [],
    startedAt: isFiniteNumber(old.startedAt) ? old.startedAt : null,
    completedAt: isFiniteNumber(old.completedAt) ? old.completedAt : null,
    failedAt: isFiniteNumber(old.failedAt) ? old.failedAt : null,
    elapsedMs: legacyElapsed,
    tool: old.tool === 'cross' ? 'cross' : 'fill',
    remainingMs,
    penaltyMs: isFiniteNumber(old.penaltyMs) ? Math.max(0, old.penaltyMs) : 0,
  };
};

export const loadData = (
  authoritativePuzzles: readonly PuzzleDefinition[],
): SavedData => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySaved();
    const x: unknown = JSON.parse(raw);
    if (!x || typeof x !== 'object') return emptySaved();
    const o = x as Partial<SavedData>;
    const currentPuzzles = new Map(
      authoritativePuzzles.map((puzzle) => [puzzle.id, puzzle]),
    );
    const puzzles: Record<string, GameState> = {};
    if (o.puzzles && typeof o.puzzles === 'object') {
      for (const [id, raw] of Object.entries(o.puzzles)) {
        const puzzle = currentPuzzles.get(id);
        const state = puzzle ? reconcilePuzzleState(raw, puzzle) : undefined;
        if (state) puzzles[id] = state;
      }
    }
    return {
      puzzles,
      completions: Array.isArray(o.completions)
        ? o.completions.filter(
            (r) =>
              r &&
              typeof r.puzzleId === 'string' &&
              currentPuzzles.get(r.puzzleId)?.publishDate === r.date &&
              typeof r.date === 'string' &&
              isFiniteNumber(r.elapsedMs),
          )
        : [],
      theme: o.theme === 'light' || o.theme === 'dark' ? o.theme : 'system',
    };
  } catch {
    return emptySaved();
  }
};
export const saveData = (data: SavedData): boolean => {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
};
