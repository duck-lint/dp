import fs from 'node:fs';
import { rowClues, columnClues } from '../src/domain/clues';
import { countSolutions } from '../src/domain/puzzle-analysis';
import type { PuzzleDefinition } from '../src/domain/puzzle';
const puzzles = JSON.parse(
  fs.readFileSync('puzzles/seed.json', 'utf8'),
) as PuzzleDefinition[];
const dates = new Set<string>(),
  ids = new Set<string>(),
  sequences = new Set<number>();
const errors: string[] = [];
for (const p of puzzles) {
  const prefix = `${p.id}:`;
  if (ids.has(p.id)) errors.push(`${prefix} duplicate id`);
  ids.add(p.id);
  if (sequences.has(p.sequenceNumber))
    errors.push(`${prefix} duplicate sequence`);
  sequences.add(p.sequenceNumber);
  if (dates.has(p.publishDate)) errors.push(`${prefix} duplicate date`);
  dates.add(p.publishDate);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(p.publishDate) ||
    Number.isNaN(Date.parse(`${p.publishDate}T12:00:00Z`))
  )
    errors.push(`${prefix} malformed date`);
  if (![5, 10, 15].includes(p.width) || p.height !== p.width)
    errors.push(`${prefix} unsupported dimensions`);
  if (
    p.solution.length !== p.height ||
    p.solution.some((r) => r.length !== p.width || /[^01]/.test(r))
  )
    errors.push(`${prefix} malformed bitmap`);
  if (!p.solution.some((r) => r.includes('1')))
    errors.push(`${prefix} blank solution`);
  const result = countSolutions(rowClues(p.solution), columnClues(p.solution));
  if (result.count !== 1)
    errors.push(`${prefix} expected one solution, found ${result.count}`);
}
const ordered = [...puzzles].sort((a, b) =>
  a.publishDate.localeCompare(b.publishDate),
);
for (let i = 1; i < ordered.length; i++)
  if (
    Date.parse(ordered[i].publishDate) -
      Date.parse(ordered[i - 1].publishDate) !==
    86400000
  )
    errors.push('publication dates must be consecutive');
if (errors.length) {
  console.error(errors.map((e) => `Puzzle validation error: ${e}`).join('\n'));
  process.exit(1);
}
console.log(`Validated ${puzzles.length} puzzles.`);
