import fs from 'node:fs';
const puzzles = JSON.parse(fs.readFileSync('puzzles/seed.json', 'utf8'));
const clues = (line) => {
  const out = [];
  let run = 0;
  for (const c of line) {
    if (c === '1') run++;
    else if (run) {
      out.push(run);
      run = 0;
    }
  }
  if (run) out.push(run);
  return out.length ? out : [0];
};
const patterns = (length, clue) => {
  if (clue.length === 1 && clue[0] === 0) return ['0'.repeat(length)];
  const out = [];
  const place = (i, start, value) => {
    if (i === clue.length) {
      out.push(value + '0'.repeat(length - value.length));
      return;
    }
    const remaining =
      clue.slice(i).reduce((a, n) => a + n, 0) + clue.length - i - 1;
    for (let at = start; at <= length - remaining; at++)
      place(
        i + 1,
        at + clue[i] + 1,
        value +
          '0'.repeat(at - start) +
          '1'.repeat(clue[i]) +
          (i < clue.length - 1 ? '0' : ''),
      );
  };
  place(0, 0, '');
  return out;
};
const solve = (p) => {
  const h = p.height,
    w = p.width,
    rc = p.solution.map((r) => clues([...r])),
    cc = Array.from({ length: w }, (_, x) =>
      clues(p.solution.map((r) => r[x])),
    ),
    rows = rc.map((c) => patterns(w, c));
  let count = 0;
  const search = (i, chosen) => {
    if (count === 2) return;
    if (i === h) {
      if (
        Array.from(
          { length: w },
          (_, x) =>
            JSON.stringify(clues(chosen.map((r) => r[x]))) ===
            JSON.stringify(cc[x]),
        ).every(Boolean)
      )
        count++;
      return;
    }
    for (const row of rows[i]) {
      if (count === 2) return;
      let ok = true;
      for (let x = 0; x < w && ok; x++) {
        const partial = [...chosen.map((r) => r[x]), row[x]];
        ok = patterns(h, cc[x]).some((pattern) =>
          partial.every((v, y) => pattern[y] === v),
        );
      }
      if (ok) search(i + 1, [...chosen, row]);
    }
  };
  search(0, []);
  return count;
};
const ids = new Set(),
  seqs = new Set(),
  dates = new Set(),
  errors = [];
for (const p of puzzles) {
  const prefix = `${p.id}:`;
  if (ids.has(p.id)) errors.push(`${prefix} duplicate id`);
  ids.add(p.id);
  if (seqs.has(p.sequenceNumber)) errors.push(`${prefix} duplicate sequence`);
  seqs.add(p.sequenceNumber);
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
  const count = solve(p);
  if (count !== 1)
    errors.push(`${prefix} expected one solution, found ${count}`);
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
