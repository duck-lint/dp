import fs from 'node:fs';
import { analyzeBitmap } from '../src/domain/puzzle-analysis';
import type { PuzzleDefinition } from '../src/domain/puzzle';
const puzzles = JSON.parse(
  fs.readFileSync('puzzles/seed.json', 'utf8'),
) as PuzzleDefinition[];
console.log(
  'Seq | Title              | Fill | Unique | Line solve | Rounds | First | Unknown | Components | Isolated',
);
console.log(
  '----|--------------------|------|--------|------------|--------|-------|---------|------------|---------',
);
for (const puzzle of puzzles) {
  const a = analyzeBitmap(puzzle.solution);
  console.log(
    `${String(puzzle.sequenceNumber).padStart(3)} | ${puzzle.reveal.title.padEnd(18).slice(0, 18)} | ${a.metrics.fillPercentage.toFixed(1).padStart(4)}% | ${a.cardinality.count === 1 ? 'yes' : a.cardinality.count === 2 ? '2+' : 'no'}    | ${a.propagation.solved ? 'yes' : 'no '}        | ${String(a.propagation.rounds.length).padStart(6)} | ${String(a.propagation.initialForcedCells).padStart(5)} | ${String(a.propagation.unresolvedCells).padStart(7)} | ${String(a.metrics.connectedComponents).padStart(10)} | ${a.metrics.isolatedPixels}`,
  );
}
