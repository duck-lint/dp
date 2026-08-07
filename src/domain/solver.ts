export type SolverResult = { count: 0 | 1 | 2; solution?: string[] };
type Pattern = string;
export const patterns = (length: number, clues: number[]): Pattern[] => {
  if (clues.length === 1 && clues[0] === 0) return ['0'.repeat(length)];
  const out: Pattern[] = [];
  const place = (i: number, start: number, value: string) => {
    if (i === clues.length) {
      out.push(value + '0'.repeat(length - value.length));
      return;
    }
    const remaining =
      clues.slice(i).reduce((a, n) => a + n, 0) + clues.length - i - 1;
    for (let at = start; at <= length - remaining; at++) {
      const prefix =
        '0'.repeat(at - start) +
        '1'.repeat(clues[i]) +
        (i < clues.length - 1 ? '0' : '');
      place(i + 1, at + clues[i] + 1, value + prefix);
    }
  };
  place(0, 0, '');
  return out;
};
const cluesOf = (line: string[]): number[] => {
  const runs: number[] = [];
  let n = 0;
  for (const c of line) {
    if (c === '1') n++;
    else if (n) {
      runs.push(n);
      n = 0;
    }
  }
  if (n) runs.push(n);
  return runs.length ? runs : [0];
};
export function solvePicross(
  rowClues: number[][],
  colClues: number[][],
): SolverResult {
  const h = rowClues.length,
    w = colClues.length,
    rows = rowClues.map((c) => patterns(w, c));
  let found: string[] | undefined,
    count = 0;
  const search = (i: number, chosen: string[]) => {
    if (count === 2) return;
    if (i === h) {
      if (
        Array.from(
          { length: w },
          (_, x) =>
            JSON.stringify(cluesOf(chosen.map((r) => r[x]))) ===
            JSON.stringify(colClues[x]),
        ).every(Boolean)
      ) {
        count += 1;
        found ??= [...chosen];
      }
      return;
    }
    for (const row of rows[i]) {
      if (count === 2) return;
      let valid = true;
      for (let x = 0; x < w && valid; x++) {
        const partial = [...chosen.map((r) => r[x]), row[x]];
        valid = patterns(h, colClues[x]).some((p) =>
          partial.every((cell, y) => p[y] === cell),
        );
      }
      if (valid) search(i + 1, [...chosen, row]);
    }
  };
  search(0, []);
  return { count: Math.min(count, 2) as 0 | 1 | 2, solution: found };
}
