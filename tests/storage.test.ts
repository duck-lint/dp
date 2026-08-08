import { describe, expect, it, beforeEach } from 'vitest';
import { emptySaved, loadData, saveData } from '../src/persistence/storage';
describe('versioned storage', () => {
  beforeEach(() => localStorage.clear());
  it('round trips valid data', () => {
    const d = emptySaved();
    d.completions = [{ puzzleId: 'x', date: '2026-08-06', elapsedMs: 4 }];
    expect(saveData(d)).toBe(true);
    expect(loadData().completions).toEqual(d.completions);
  });
  it('discards malformed portions without crashing', () => {
    localStorage.setItem(
      'daily-picross:v1',
      '{"completions":[{"puzzleId":"ok","date":"2026-01-01","elapsedMs":3},null,{"bad":true}],"puzzles":"bad"}',
    );
    expect(loadData()).toMatchObject({
      completions: [{ puzzleId: 'ok', date: '2026-01-01', elapsedMs: 3 }],
      puzzles: {},
    });
  });
  it('migrates legacy in-progress games to a bounded countdown state', () => {
    localStorage.setItem(
      'daily-picross:v1',
      JSON.stringify({
        puzzles: {
          old: {
            board: [['filled']],
            tool: 'erase',
            history: [],
            future: [],
            startedAt: 10,
            elapsedMs: 60_000,
            completedAt: null,
          },
        },
      }),
    );
    const migrated = loadData().puzzles.old;
    expect(migrated.remainingMs).toBe(34 * 60 * 1000);
    expect(migrated.tool).toBe('fill');
    expect(migrated.failedAt).toBeNull();
  });
});
