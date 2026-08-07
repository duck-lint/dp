import { GameState } from '../domain/game-state';
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
    return {
      puzzles: o.puzzles && typeof o.puzzles === 'object' ? o.puzzles : {},
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
