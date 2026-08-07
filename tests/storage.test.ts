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
});
