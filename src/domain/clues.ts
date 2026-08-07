export const lineClues = (line: string[]): number[] => {
  const out: number[] = [];
  let run = 0;
  for (const cell of line) {
    if (cell === '1') run++;
    else if (run) {
      out.push(run);
      run = 0;
    }
  }
  if (run) out.push(run);
  return out.length ? out : [0];
};
export const rowClues = (solution: string[]): number[][] =>
  solution.map((row) => lineClues([...row]));
export const columnClues = (solution: string[]): number[][] =>
  Array.from({ length: solution[0]?.length ?? 0 }, (_, x) =>
    lineClues(solution.map((row) => row[x])),
  );
export const lineSatisfied = (line: string[], clues: number[]): boolean =>
  JSON.stringify(lineClues(line)) === JSON.stringify(clues);
