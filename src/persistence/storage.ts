import {
  GAME_DURATION_MS,
  initialGame,
  type GameState,
} from '../domain/game-state';
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
export const loadData = (): SavedData => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySaved();
    const x: unknown = JSON.parse(raw);
    if (!x || typeof x !== 'object') return emptySaved();
    const o = x as Partial<SavedData>;
    const puzzles: Record<string, GameState> = {};
    if (o.puzzles && typeof o.puzzles === 'object') {
      for (const [id, raw] of Object.entries(o.puzzles)) {
        if (
          !raw ||
          typeof raw !== 'object' ||
          !Array.isArray((raw as GameState).board)
        )
          continue;
        const old = raw as Partial<GameState>;
        const height = old.board?.length ?? 0;
        const width = height ? (old.board?.[0]?.length ?? 0) : 0;
        if (!width || !height) continue;
        const fallback = initialGame(width, height);
        const legacyElapsed =
          typeof old.elapsedMs === 'number' ? old.elapsedMs : 0;
        puzzles[id] = {
          ...fallback,
          ...old,
          history: Array.isArray(old.history) ? old.history : [],
          future: Array.isArray(old.future) ? old.future : [],
          startedAt: typeof old.startedAt === 'number' ? old.startedAt : null,
          completedAt:
            typeof old.completedAt === 'number' ? old.completedAt : null,
          elapsedMs: legacyElapsed,
          tool: old.tool === 'cross' ? 'cross' : 'fill',
          remainingMs:
            typeof old.remainingMs === 'number'
              ? Math.max(0, Math.min(GAME_DURATION_MS, old.remainingMs))
              : Math.max(0, GAME_DURATION_MS - legacyElapsed),
          penaltyMs: typeof old.penaltyMs === 'number' ? old.penaltyMs : 0,
          failedAt: typeof old.failedAt === 'number' ? old.failedAt : null,
        } as GameState;
      }
    }
    return {
      puzzles,
      completions: Array.isArray(o.completions)
        ? o.completions.filter(
            (r) =>
              r &&
              typeof r.puzzleId === 'string' &&
              typeof r.date === 'string' &&
              typeof r.elapsedMs === 'number',
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
