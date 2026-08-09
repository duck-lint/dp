import { describe, expect, it, vi } from 'vitest';
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
import { deriveAchievements } from '../src/domain/achievements';
import { solvePicross } from '../src/domain/solver';
import {
  analyzeBitmap,
  compatiblePatterns,
  countSolutions,
  linePatterns,
  solveByLinePropagation,
} from '../src/domain/puzzle-analysis';
import {
  CardinalityAnalysisController,
  type CardinalityState,
  type CardinalityWorker,
} from '../src/authoring/cardinality-analysis';
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
  it('derives bounded achievements from local completion records', () => {
    const completions = [
      { puzzleId: 'clean', date: '2026-08-06', elapsedMs: 1000 },
      { puzzleId: 'penalized', date: '2026-08-07', elapsedMs: 2000 },
    ];
    const achievements = deriveAchievements(
      completions,
      {
        clean: { ...initialGame(1, 1), penaltyMs: 0 },
        penalized: { ...initialGame(1, 1), penaltyMs: 180000 },
      },
      2,
      3,
    );
    expect(
      achievements.find((item) => item.id === 'first-solve')?.unlocked,
    ).toBe(true);
    expect(achievements.find((item) => item.id === 'streak-3')?.unlocked).toBe(
      true,
    );
    expect(
      achievements.find((item) => item.id === 'clean-solve')?.unlocked,
    ).toBe(true);
    expect(achievements.find((item) => item.id === 'explorer')?.unlocked).toBe(
      false,
    );
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
    const result = solveByLinePropagation(rows, columns);
    expect(result).toMatchObject({
      solved: false,
      contradiction: false,
      unresolvedCells: 16,
    });
    expect(result.board.join('').split('?')).toHaveLength(17);
    expect(result.board.join('').match(/\?/g)).toHaveLength(16);
    expect(
      result.rounds.some((round) => round.board.join('').includes('?')),
    ).toBe(true);
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
  it('cancels obsolete cardinality work and ignores stale results', () => {
    vi.useFakeTimers();
    const states: string[] = [];
    const workers: Array<{
      worker: CardinalityWorker;
      respond: (count: 0 | 1 | 2) => void;
    }> = [];
    const controller = new CardinalityAnalysisController(
      (state) => states.push(`${state.status}:${state.count ?? ''}`),
      () => {
        let respond!: (count: 0 | 1 | 2) => void;
        const worker: CardinalityWorker = {
          onmessage: null,
          onerror: null,
          postMessage: () => undefined,
          terminate: vi.fn(),
        };
        respond = (count) =>
          worker.onmessage?.({ data: { count } } as MessageEvent);
        workers.push({ worker, respond });
        return worker;
      },
      10,
    );

    controller.update({ rows: [[1]], columns: [[1]] });
    vi.advanceTimersByTime(10);
    expect(states).toEqual(['pending:', 'checking:']);
    const firstWorker = workers[0].worker;

    controller.update({ rows: [[0]], columns: [[0]] });
    expect(firstWorker.terminate).toHaveBeenCalled();
    expect(states.at(-1)).toBe('pending:');
    workers[0].respond(1);
    expect(states.at(-1)).toBe('pending:');

    vi.advanceTimersByTime(10);
    workers[1].respond(2);
    expect(states.at(-1)).toBe('ready:2');

    controller.update({ rows: [[1]], columns: [[1]] });
    controller.dispose();
    expect(workers[1].worker.terminate).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('terminates a worker after a successful result', () => {
    vi.useFakeTimers();
    const states: CardinalityState[] = [];
    let worker!: CardinalityWorker;
    const controller = new CardinalityAnalysisController(
      (state) => states.push(state),
      () => {
        worker = {
          onmessage: null,
          onerror: null,
          postMessage: () => undefined,
          terminate: vi.fn(),
        };
        return worker;
      },
      10,
    );

    controller.update({ rows: [[1]], columns: [[1]] });
    vi.advanceTimersByTime(10);
    worker.onmessage!({ data: { count: 1 } } as MessageEvent);

    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({ status: 'ready', count: 1 });

    controller.update({ rows: [[0]], columns: [[0]] });
    vi.advanceTimersByTime(10);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('terminates a worker after an error and allows a fresh request', () => {
    vi.useFakeTimers();
    const states: CardinalityState[] = [];
    const workers: CardinalityWorker[] = [];
    const controller = new CardinalityAnalysisController(
      (state) => states.push(state),
      () => {
        const worker: CardinalityWorker = {
          onmessage: null,
          onerror: null,
          postMessage: vi.fn(),
          terminate: vi.fn(),
        };
        workers.push(worker);
        return worker;
      },
      10,
    );

    controller.update({ rows: [[1]], columns: [[1]] });
    vi.advanceTimersByTime(10);
    workers[0].onerror!({} as ErrorEvent);

    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({ status: 'error' });

    controller.update({ rows: [[0]], columns: [[0]] });
    vi.advanceTimersByTime(10);
    expect(workers).toHaveLength(2);
    workers[1].onmessage!({ data: { count: 0 } } as MessageEvent);
    expect(workers[1].terminate).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({ status: 'ready', count: 0 });
    vi.useRealTimers();
  });
});
