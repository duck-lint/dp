import { describe, expect, it, beforeEach } from 'vitest';
import { emptySaved, loadData, saveData } from '../src/persistence/storage';
import type { PuzzleDefinition } from '../src/domain/puzzle';

const puzzle: PuzzleDefinition = {
  schemaVersion: 1,
  id: 'current',
  sequenceNumber: 1,
  publishDate: '2026-08-08',
  width: 15,
  height: 15,
  solution: Array.from({ length: 15 }, () => '0'.repeat(15)),
  reveal: { title: 'Current', description: 'Current' },
};
const board = Array.from({ length: 15 }, () =>
  Array<'unknown'>(15).fill('unknown'),
);
describe('versioned storage', () => {
  beforeEach(() => localStorage.clear());
  it('round trips valid data', () => {
    const d = emptySaved();
    d.completions = [{ puzzleId: 'current', date: '2026-08-08', elapsedMs: 4 }];
    expect(saveData(d)).toBe(true);
    expect(loadData([puzzle]).completions).toEqual(d.completions);
  });
  it('discards malformed portions without crashing', () => {
    localStorage.setItem(
      'daily-picross:v1',
      '{"completions":[{"puzzleId":"ok","date":"2026-01-01","elapsedMs":3},null,{"bad":true}],"puzzles":"bad"}',
    );
    expect(loadData([])).toMatchObject({
      completions: [],
      puzzles: {},
    });
  });
  it('ignores obsolete in-progress games', () => {
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
    const migrated = loadData([puzzle]).puzzles.old;
    expect(migrated).toBeUndefined();
  });

  it('rejects a legacy 5x5 board under a current 15x15 identity', () => {
    localStorage.setItem(
      'daily-picross:v1',
      JSON.stringify({ puzzles: { current: { board: [['filled']] } } }),
    );
    expect(loadData([puzzle]).puzzles.current).toBeUndefined();
  });

  it('rejects a board with a malformed row width', () => {
    const malformed = board.map((row) => [...row]);
    malformed[4] = malformed[4].slice(0, 14);
    localStorage.setItem(
      'daily-picross:v1',
      JSON.stringify({ puzzles: { current: { board: malformed } } }),
    );
    expect(loadData([puzzle]).puzzles.current).toBeUndefined();
  });

  it('preserves a structurally valid current puzzle state', () => {
    const state = { board, tool: 'fill', elapsedMs: 10 };
    localStorage.setItem(
      'daily-picross:v1',
      JSON.stringify({ puzzles: { current: state } }),
    );
    expect(loadData([puzzle]).puzzles.current.board).toEqual(board);
  });

  it('does not reassign obsolete completion records', () => {
    localStorage.setItem(
      'daily-picross:v1',
      JSON.stringify({
        completions: [
          { puzzleId: 'p-2026-08-08', date: '2026-08-08', elapsedMs: 3 },
          { puzzleId: 'current', date: '2026-08-07', elapsedMs: 4 },
          { puzzleId: 'current', date: '2026-08-08', elapsedMs: 5 },
        ],
      }),
    );
    expect(loadData([puzzle]).completions).toEqual([
      { puzzleId: 'current', date: '2026-08-08', elapsedMs: 5 },
    ]);
  });

  it('keeps malformed legacy records inert without throwing', () => {
    localStorage.setItem(
      'daily-picross:v1',
      JSON.stringify({ puzzles: { old: { board: [['filled']] } } }),
    );
    expect(() => loadData([puzzle])).not.toThrow();
    expect(loadData([puzzle]).puzzles).toEqual({});
  });
});
