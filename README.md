# Daily Picross

Daily Picross is a static, local-first Picross game: one authored puzzle per calendar date, a playable archive, persistent progress, completion statistics, and non-spoiling share text. It has no backend, accounts, analytics, ads, or copied third-party assets.

## Development

```bash
npm ci
npm run dev
npm run validate:puzzles
npm test
npm run build
```

Available checks also include `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm run test:e2e`.

## Architecture

`src/domain` owns immutable puzzle contracts, clue derivation, solving, dates, game transitions, completion comparison, and statistics. `src/persistence` owns versioned localStorage. React components render the board and dispatch domain transitions; they do not define Picross rules. `puzzles/seed.json` is the authored corpus and `tools/validate-puzzles.ts` is the deterministic release gate.

## Puzzle authoring

The development-only authoring lab is available while running `npm run dev` at
`/author.html`. Draw or load a 15×15 candidate, inspect its clean silhouette and
objective analysis, then copy the bitmap or complete candidate JSON for an
ordinary reviewed corpus change. The lab never reads or writes gameplay
persistence and is excluded from the production build.

`npm run analyze:puzzles` prints the same raw analysis over the current seed
corpus. A unique solution is not the same thing as a deterministic no-guess
line solve, and neither establishes that a silhouette is recognizable or that
the solve is satisfying; those remain separate human review questions.

Add a `PuzzleDefinition` object to `puzzles/seed.json`:

```json
{
  "schemaVersion": 1,
  "id": "p-2026-08-20-r1",
  "sequenceNumber": 15,
  "publishDate": "2026-08-20",
  "width": 5,
  "height": 5,
  "solution": ["00100", "01110", "11111", "00100", "00100"],
  "reveal": { "title": "A kite", "description": "A small pixel-art shape." }
}
```

Solutions contain one `1`/`0` string per row. Row and column clues are derived from that bitmap and are never authored separately. Validation rejects malformed data, duplicate identity/date/sequence values, blank puzzles, and any solution that is not uniquely solvable. Run `npm run validate:puzzles` before release.

Puzzle IDs identify immutable puzzle definitions. Publication date and sequence number are not replacement identity. If the dimensions or authoritative solution change after progress may exist, assign a new puzzle ID; do not reuse an already-published or persisted puzzle ID for changed content.

## Dates, persistence, and streaks

The game uses the player’s local calendar date, not UTC, to select today’s puzzle. Future puzzles are not shown in the archive. Progress is stored under the namespaced `daily-picross:v1` localStorage key by immutable puzzle ID. Invalid stored fragments are discarded while valid records survive; if storage is unavailable, the active session remains playable in memory.

A streak is consecutive published puzzle dates completed by the player. It is a solve-sequence streak: completing an older archive puzzle can repair a missing date. Completion records, not mutable counters, are the source for derived statistics.

## Deployment

`.github/workflows/pages.yml` validates and builds the static `dist` output, then deploys it to GitHub Pages. The Vite relative base supports repository subpaths. The repository’s Pages source must be set to **GitHub Actions** once in Settings → Pages; no repository setting is changed by this project.

## MVP limitations

Puzzle authoring is file-based, there is no remote sync or account system, and the initial archive is intentionally small. The included corpus favors clear, friendly pixel forms over a large difficulty curve. There are no hints, procedural generation, leaderboards, or offline service worker.
