import { columnClues, rowClues } from './clues';

export type SolutionCount = 0 | 1 | 2;
export type PartialLine = Array<'0' | '1' | '?'>;

/** Every legal placement of a clue in a line of the given length. */
export const linePatterns = (length: number, clues: number[]): string[] => {
  if (clues.length === 1 && clues[0] === 0) return ['0'.repeat(length)];
  const result: string[] = [];
  const place = (index: number, start: number, value: string) => {
    if (index === clues.length) {
      result.push(value + '0'.repeat(length - value.length));
      return;
    }
    const remaining =
      clues.slice(index).reduce((sum, run) => sum + run, 0) +
      clues.length -
      index -
      1;
    for (let at = start; at <= length - remaining; at++) {
      const prefix =
        '0'.repeat(at - start) +
        '1'.repeat(clues[index]) +
        (index < clues.length - 1 ? '0' : '');
      place(index + 1, at + clues[index] + 1, value + prefix);
    }
  };
  place(0, 0, '');
  return result;
};

export const compatiblePatterns = (
  patterns: string[],
  partial: PartialLine,
): string[] =>
  patterns.filter((pattern) =>
    partial.every((cell, index) => cell === '?' || pattern[index] === cell),
  );

export type CardinalityResult = {
  count: SolutionCount;
  solution?: string[];
};

/** Count clue-compatible boards, stopping at the second solution. */
export const countSolutions = (
  rowCluesInput: number[][],
  columnCluesInput: number[][],
): CardinalityResult => {
  const height = rowCluesInput.length;
  const width = columnCluesInput.length;
  const rowDomains = rowCluesInput.map((clue) => linePatterns(width, clue));
  const columnDomains = columnCluesInput.map((clue) =>
    linePatterns(height, clue),
  );
  let count = 0 as SolutionCount;
  let firstSolution: string[] | undefined;
  const search = (row: number, chosen: string[]) => {
    if (count === 2) return;
    if (row === height) {
      count = Math.min(2, count + 1) as SolutionCount;
      firstSolution ??= [...chosen];
      return;
    }
    for (const candidate of rowDomains[row]) {
      const valid = candidate.split('').every((_, x) => {
        const partial = chosen.map((line) => line[x] as '0' | '1');
        partial.push(candidate[x] as '0' | '1');
        return compatiblePatterns(columnDomains[x], partial).length > 0;
      });
      if (valid) search(row + 1, [...chosen, candidate]);
      if ((count as number) === 2) return;
    }
  };
  search(0, []);
  return { count, solution: firstSolution };
};

export type PropagationRound = {
  round: number;
  forcedCells: number;
  resolvedCells: number;
  board: string[];
};

export type LinePropagationResult = {
  solved: boolean;
  contradiction: boolean;
  rounds: PropagationRound[];
  initialForcedCells: number;
  unresolvedCells: number;
  board: string[];
};

/** Solve only by repeatedly intersecting compatible row and column domains. */
export const solveByLinePropagation = (
  rowCluesInput: number[][],
  columnCluesInput: number[][],
): LinePropagationResult => {
  const height = rowCluesInput.length;
  const width = columnCluesInput.length;
  const board = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => '?' as '0' | '1' | '?'),
  );
  const rowDomains = rowCluesInput.map((clue) => linePatterns(width, clue));
  const columnDomains = columnCluesInput.map((clue) =>
    linePatterns(height, clue),
  );
  const rounds: PropagationRound[] = [];
  let contradiction = false;
  while (!contradiction && board.some((row) => row.includes('?'))) {
    const before = board.map((row) => [...row]);
    for (let y = 0; y < height && !contradiction; y++) {
      const compatible = compatiblePatterns(rowDomains[y], board[y]);
      if (!compatible.length) {
        contradiction = true;
        break;
      }
      for (let x = 0; x < width; x++) {
        const value = compatible.every((pattern) => pattern[x] === '1')
          ? '1'
          : compatible.every((pattern) => pattern[x] === '0')
            ? '0'
            : '?';
        if (value !== '?') board[y][x] = value;
      }
    }
    for (let x = 0; x < width && !contradiction; x++) {
      const partial = board.map((row) => row[x]);
      const compatible = compatiblePatterns(columnDomains[x], partial);
      if (!compatible.length) {
        contradiction = true;
        break;
      }
      for (let y = 0; y < height; y++) {
        const value = compatible.every((pattern) => pattern[y] === '1')
          ? '1'
          : compatible.every((pattern) => pattern[y] === '0')
            ? '0'
            : '?';
        if (value !== '?') board[y][x] = value;
      }
    }
    const resolvedCells = board.flat().filter((cell) => cell !== '?').length;
    const previousResolved = before
      .flat()
      .filter((cell) => cell !== '?').length;
    const forcedCells = resolvedCells - previousResolved;
    const round = rounds.length + 1;
    rounds.push({
      round,
      forcedCells,
      resolvedCells,
      board: board.map((row) =>
        row.map((cell) => (cell === '?' ? '0' : cell)).join(''),
      ),
    });
    if (forcedCells === 0) break;
  }
  return {
    solved:
      !contradiction && board.every((row) => row.every((cell) => cell !== '?')),
    contradiction,
    rounds,
    initialForcedCells: rounds[0]?.forcedCells ?? 0,
    unresolvedCells: board.flat().filter((cell) => cell === '?').length,
    board: board.map((row) =>
      row.map((cell) => (cell === '?' ? '0' : cell)).join(''),
    ),
  };
};

export type BitmapMetrics = {
  filledCells: number;
  fillPercentage: number;
  connectedComponents: number;
  isolatedPixels: number;
  boundingBox: { width: number; height: number } | null;
  margins: { top: number; bottom: number; left: number; right: number };
};

export const bitmapMetrics = (solution: string[]): BitmapMetrics => {
  const height = solution.length;
  const width = solution[0]?.length ?? 0;
  const filled: Array<[number, number]> = [];
  solution.forEach((row, y) =>
    [...row].forEach((cell, x) => cell === '1' && filled.push([y, x])),
  );
  const filledSet = new Set(filled.map(([y, x]) => `${y}:${x}`));
  const seen = new Set<string>();
  let components = 0;
  let isolated = 0;
  for (const [y, x] of filled) {
    const key = `${y}:${x}`;
    const neighbours = [
      [y - 1, x],
      [y + 1, x],
      [y, x - 1],
      [y, x + 1],
    ];
    if (neighbours.every(([ny, nx]) => !filledSet.has(`${ny}:${nx}`)))
      isolated++;
    if (seen.has(key)) continue;
    components++;
    const queue = [[y, x]];
    seen.add(key);
    while (queue.length) {
      const [cy, cx] = queue.pop()!;
      for (const [ny, nx] of [
        [cy - 1, cx],
        [cy + 1, cx],
        [cy, cx - 1],
        [cy, cx + 1],
      ]) {
        const next = `${ny}:${nx}`;
        if (filledSet.has(next) && !seen.has(next)) {
          seen.add(next);
          queue.push([ny, nx]);
        }
      }
    }
  }
  if (!filled.length)
    return {
      filledCells: 0,
      fillPercentage: 0,
      connectedComponents: 0,
      isolatedPixels: 0,
      boundingBox: null,
      margins: { top: height, bottom: height, left: width, right: width },
    };
  const ys = filled.map(([y]) => y);
  const xs = filled.map(([, x]) => x);
  const top = Math.min(...ys),
    bottom = Math.max(...ys),
    left = Math.min(...xs),
    right = Math.max(...xs);
  return {
    filledCells: filled.length,
    fillPercentage: (filled.length / (width * height)) * 100,
    connectedComponents: components,
    isolatedPixels: isolated,
    boundingBox: { width: right - left + 1, height: bottom - top + 1 },
    margins: {
      top,
      bottom: height - 1 - bottom,
      left,
      right: width - 1 - right,
    },
  };
};

export const analyzeBitmap = (solution: string[]) => {
  const rows = rowClues(solution);
  const columns = columnClues(solution);
  const cardinality = countSolutions(rows, columns);
  const propagation = solveByLinePropagation(rows, columns);
  return {
    rows,
    columns,
    cardinality,
    propagation,
    metrics: bitmapMetrics(solution),
  };
};
