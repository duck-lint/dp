import { describe, expect, it } from 'vitest';
import { columnClues, lineClues, rowClues } from '../src/domain/clues';
import { choosePuzzle, localDateKey } from '../src/domain/dates';
import {
  applyCell,
  GAME_DURATION_MS,
  initialGame,
  redo,
  undo,
  WRONG_MARK_PENALTY_MS,
} from '../src/domain/game-state';
import { isSolved, makeBoard } from '../src/domain/puzzle';
import { deriveStatistics } from '../src/domain/statistics';
import { solvePicross } from '../src/domain/solver';
import {
  analyzeBitmap,
  compatiblePatterns,
  countSolutions,
  linePatterns,
  solveByLinePropagation,
} from '../src/domain/puzzle-analysis';
describe('picross domain', () => {
  it('derives clues including empty lines', () => {
    expect(lineClues([...'0000'])).toEqual([0]);
    expect(rowClues(['1100', '0000'])).toEqual([[2], [0]]);
    expect(columnClues(['1100', '0000'])).toEqual([[1], [1], [0], [0]]);
  });
  it('transitions cells and supports bounded undo/redo', () => {
    let s = initialGame(2, 2);
    s = applyCell(s, 0, 0, 'fill');
    s = applyCell(s, 0, 1, 'cross');
    expect(s.board[0]).toEqual(['filled', 'crossed']);
    s = undo(s);
    expect(s.board[0]).toEqual(['filled', 'unknown']);
    s = redo(s);
    expect(s.board[0]).toEqual(['filled', 'crossed']);
  });
  it('uses direct mark toggles and replaces the opposite mark', () => {
    const solution = ['10', '01'];
    let s = initialGame(2, 2);
    s = applyCell(s, 0, 0, 'fill', solution, 1000);
    expect(s.board[0][0]).toBe('filled');
    s = applyCell(s, 0, 0, 'fill', solution, 1001);
    expect(s.board[0][0]).toBe('unknown');
    s = applyCell(s, 0, 0, 'cross', solution, 1002);
    expect(s.board[0][0]).toBe('crossed');
    s = applyCell(s, 0, 0, 'fill', solution, 1003);
    expect(s.board[0][0]).toBe('filled');
  });
  it('charges wrong marks once, never charges clearing, and clamps at zero', () => {
    const solution = ['1'];
    let s = initialGame(1, 1);
    s = applyCell(s, 0, 0, 'cross', solution, 1000);
    expect(s.remainingMs).toBe(GAME_DURATION_MS - WRONG_MARK_PENALTY_MS);
    s = applyCell(s, 0, 0, 'cross', solution, 1000);
    expect(s.remainingMs).toBe(GAME_DURATION_MS - WRONG_MARK_PENALTY_MS);
    s = applyCell(s, 0, 0, 'fill', solution, 1000);
    expect(s.remainingMs).toBe(GAME_DURATION_MS - WRONG_MARK_PENALTY_MS);
    let exhausted = initialGame(1, 1);
    exhausted = {
      ...exhausted,
      remainingMs: WRONG_MARK_PENALTY_MS,
      startedAt: 2000,
    };
    exhausted = applyCell(exhausted, 0, 0, 'cross', solution, 2000);
    expect(exhausted.remainingMs).toBe(0);
    expect(exhausted.failedAt).toBe(2000);
  });
  it('does not refund penalties on undo or duplicate them on redo', () => {
    const solution = ['1'];
    let s = applyCell(initialGame(1, 1), 0, 0, 'cross', solution, 1000);
    const charged = s.remainingMs;
    s = undo(s, 1000);
    expect(s.remainingMs).toBe(charged);
    s = redo(s, 1000);
    expect(s.remainingMs).toBe(charged);
    expect(s.penaltyMs).toBe(WRONG_MARK_PENALTY_MS);
  });
  it('keeps a drag clear operation limited to the mark that started it', () => {
    let s = applyCell(initialGame(2, 1), 0, 0, 'fill', ['11'], 1000);
    s = applyCell(s, 0, 1, 'cross', ['11'], 1000);
    s = applyCell(s, 0, 0, 'erase', ['11'], 1000, 'filled');
    s = applyCell(s, 0, 1, 'erase', ['11'], 1000, 'filled');
    expect(s.board[0]).toEqual(['unknown', 'crossed']);
  });
  it('starts at 35 minutes and blocks edits after timeout', () => {
    const initial = initialGame(2, 2);
    expect(initial.remainingMs).toBe(GAME_DURATION_MS);
    expect(initial.startedAt).toBeNull();
    const started = applyCell(initial, 0, 0, 'fill', ['10', '00'], 5000);
    expect(started.startedAt).toBe(5000);
    const timedOut = { ...started, startedAt: 5000, remainingMs: 1 };
    const locked = applyCell(timedOut, 0, 1, 'fill', ['10', '00'], 5002);
    expect(locked.board[0][1]).toBe('unknown');
    expect(locked.failedAt).toBe(5002);
  });
  it('compares a board to the authoritative solution', () => {
    const p = {
      schemaVersion: 1 as const,
      id: 'x',
      sequenceNumber: 1,
      publishDate: '2026-01-01',
      width: 2,
      height: 2,
      solution: ['10', '01'],
      reveal: { title: 'x', description: 'x' },
    };
    expect(
      isSolved(p, [
        ['filled', 'unknown'],
        ['unknown', 'filled'],
      ]),
    ).toBe(true);
    expect(isSolved(p, makeBoard(2, 2))).toBe(false);
  });
  it('chooses only a published puzzle for a local date', () => {
    const ps = [
      { publishDate: '2026-08-06', id: 'a' },
      { publishDate: '2026-08-08', id: 'b' },
    ];
    expect(choosePuzzle(ps, '2026-08-07')?.id).toBe('a');
    expect(choosePuzzle(ps, '2026-08-05')).toBeUndefined();
  });
  it('formats the local calendar date without UTC rollover', () => {
    expect(localDateKey(new Date(2026, 7, 6, 23, 59))).toBe('2026-08-06');
  });
  it('derives archive-repaired streaks and statistics', () => {
    const records = [
      { puzzleId: 'a', date: '2026-08-06', elapsedMs: 1000 },
      { puzzleId: 'b', date: '2026-08-08', elapsedMs: 3000 },
      { puzzleId: 'c', date: '2026-08-07', elapsedMs: 2000 },
    ];
    expect(deriveStatistics(records)).toMatchObject({
      total: 3,
      currentStreak: 3,
      bestStreak: 3,
      averageMs: 2000,
      fastestMs: 1000,
    });
  });
  it('distinguishes unsolvable, unique, and ambiguous line systems', () => {
    expect(solvePicross([[2]], [[1], [0]]).count).toBe(0);
    expect(solvePicross([[1]], [[1], [0]]).count).toBe(1);
    expect(solvePicross([[1], [1]], [[1], [1]]).count).toBe(2);
  });
  it('generates legal line placements and filters partial lines', () => {
    expect(linePatterns(5, [2, 1])).toEqual(['11010', '11001', '01101']);
    expect(
      compatiblePatterns(linePatterns(5, [2]), ['?', '1', '?', '0', '?']),
    ).toEqual(['11000', '01100']);
  });
  it('counts zero, one, and two-plus clue-compatible boards', () => {
    expect(countSolutions([[2]], [[1], [0]]).count).toBe(0);
    expect(countSolutions([[1]], [[1], [0]]).count).toBe(1);
    expect(countSolutions([[1], [1]], [[1], [1]]).count).toBe(2);
  });
  it('records deterministic propagation rounds without branching', () => {
    const solved = ['10100', '01101', '00011', '01011', '10110'];
    const result = solveByLinePropagation(
      rowClues(solved),
      columnClues(solved),
    );
    expect(result.solved).toBe(true);
    expect(result.contradiction).toBe(false);
    expect(result.rounds.length).toBeGreaterThan(1);
    expect(result.initialForcedCells).toBe(result.rounds[0].forcedCells);
  });
  it('distinguishes a unique puzzle that line propagation cannot finish', () => {
    const stalled = ['00000', '00111', '11100', '11000', '00011'];
    const rows = rowClues(stalled);
    const columns = columnClues(stalled);
    expect(countSolutions(rows, columns).count).toBe(1);
    expect(solveByLinePropagation(rows, columns)).toMatchObject({
      solved: false,
      contradiction: false,
      unresolvedCells: 16,
    });
  });
  it('reports raw bitmap structure without aesthetic judgments', () => {
    expect(analyzeBitmap(['100', '000', '001'])).toMatchObject({
      metrics: {
        filledCells: 2,
        fillPercentage: (2 / 9) * 100,
        connectedComponents: 2,
        isolatedPixels: 2,
        boundingBox: { width: 3, height: 3 },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      },
    });
  });
});
