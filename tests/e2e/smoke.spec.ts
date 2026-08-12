import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'UTC' });

test('authoring bitmap supports binary primary gestures and canvas-local erase', async ({
  browser,
}) => {
  const context = await browser.newContext({ hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto('/author.html');
    const cells = page.locator('.author-editor button');
    const first = cells.nth(0);
    const second = cells.nth(1);
    await first.tap();
    await expect(first).toHaveAccessibleName(/filled/);
    await first.tap();
    await expect(first).toHaveAccessibleName(/empty/);

    const firstBox = await first.boundingBox();
    const secondBox = await second.boundingBox();
    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();
    await page.mouse.move(firstBox!.x + 4, firstBox!.y + 4);
    await page.mouse.down();
    await page.mouse.move(secondBox!.x + 4, secondBox!.y + 4);
    await page.mouse.up();
    await expect(first).toHaveAccessibleName(/filled/);
    await expect(second).toHaveAccessibleName(/filled/);

    await first.click({ button: 'right' });
    await expect(first).toHaveAccessibleName(/empty/);
    const contextWasPrevented = await page.evaluate(() => {
      const editor = document.querySelector('.author-editor')!;
      return !editor.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      );
    });
    expect(contextWasPrevented).toBe(true);
  } finally {
    await context.close();
  }
});

test('authoring lab edits and clears a fixed 15x15 bitmap', async ({
  page,
}) => {
  await page.goto('/author.html');
  await expect(
    page.getByRole('heading', { name: 'Picross authoring lab' }),
  ).toBeVisible();
  const cells = page.locator('.author-editor button');
  await expect(cells).toHaveCount(225);
  await cells.nth(0).click();
  await expect(cells.nth(0)).toHaveAccessibleName(/filled/);
  await expect(page.locator('.metrics')).toContainText('Filled cells');
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(cells.nth(0)).toHaveAccessibleName(/empty/);
});

test('authoring remains editable while exact cardinality is pending', async ({
  page,
}) => {
  await page.goto('/author.html');
  const cells = page.locator('.author-editor button');
  const edited = [0, 1, 2, 15, 16, 17, 30, 31, 32, 112];

  // These rapid edits create a nontrivial partial candidate. The assertion is
  // deliberately about visible edits before the debounce/worker completes.
  for (const index of edited) await cells.nth(index).click();
  await expect(cells.nth(112)).toHaveAccessibleName(/filled/);
  await expect(page.locator('.metrics dd').nth(3)).toHaveText(
    /pending|checking/,
  );

  await cells.nth(113).click();
  await expect(cells.nth(113)).toHaveAccessibleName(/filled/);
  await expect(page.locator('.metrics dd').nth(3)).toHaveText(
    /pending|checking/,
  );
  await expect(page.locator('.metrics dd').nth(3)).toHaveText(/yes|no/, {
    timeout: 15_000,
  });
});

test('authoring displays canonical worker cardinality results', async ({
  page,
}) => {
  await page.goto('/author.html');
  const unique = page.locator('.metrics dd').nth(3);
  await page.getByLabel('Load seed').selectOption('p-2026-08-08-r2');
  await expect(unique).toHaveText(/yes \(1\)/, { timeout: 15_000 });

  await page.getByRole('button', { name: 'Start blank' }).click();
  await page.locator('.author-editor button').nth(112).click();
  await page.locator('.author-editor button').nth(128).click();
  await expect(unique).toHaveText(/no \(2\+\)/, { timeout: 15_000 });
});

test('authoring lab loads seeds and protects immutable identity on export', async ({
  page,
}) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/author.html');
  await page.getByLabel('Load seed').selectOption('p-2026-08-08-r2');
  await expect(page.locator('.author-editor .filled')).toHaveCount(92);
  await page.locator('.author-editor button').nth(0).click();
  await expect(page.getByText(/solution changed/i)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Copy puzzle JSON' }),
  ).toBeDisabled();
  await page.getByLabel('ID').fill('candidate-new');
  await expect(
    page.getByRole('button', { name: 'Copy puzzle JSON' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Copy puzzle JSON' }).click();
  const exported = JSON.parse(
    await page.evaluate(() => navigator.clipboard.readText()),
  ) as Record<string, unknown>;
  expect(Object.keys(exported)).toEqual([
    'schemaVersion',
    'id',
    'sequenceNumber',
    'publishDate',
    'width',
    'height',
    'solution',
    'reveal',
  ]);
  expect(exported).not.toHaveProperty('title');
  expect(exported).not.toHaveProperty('description');
  expect(exported.reveal).toMatchObject({
    title: expect.any(String),
    description: expect.any(String),
  });
});

test('opens the daily puzzle and archive', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Daily Picross/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible();
});

test('falls back to the latest published puzzle when today is unpublished', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-20T12:00:00Z') });
  await page.goto('/');
  await expect(page.locator('.intro .muted')).toContainText('Archive puzzle');
  await expect(
    page.getByRole('heading', { name: /Aug 19, 2026/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No puzzle published for this date' }),
  ).toHaveCount(0);
});

test('rejects an incompatible persisted board before rendering the game', async ({
  page,
}) => {
  const runtimeErrors: Error[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error));

  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });

  await page.addInitScript(() => {
    const legacyBoard = Array.from({ length: 5 }, () =>
      Array<'unknown'>(5).fill('unknown'),
    );
    window.localStorage.setItem(
      'daily-picross:v1',
      JSON.stringify({
        puzzles: {
          'p-2026-08-08-r2': {
            board: legacyBoard,
            tool: 'fill',
            history: [],
            future: [],
            startedAt: null,
            remainingMs: 2_000_000,
            penaltyMs: 0,
            elapsedMs: 0,
            completedAt: null,
            failedAt: null,
          },
        },
        completions: [],
        theme: 'system',
      }),
    );
  });

  await page.goto('/');

  await expect(page.getByText(/Daily Picross/).first()).toBeVisible();
  await expect(page.getByTestId('cell-14-14')).toBeVisible();
  await expect(page.getByTestId(/^cell-/)).toHaveCount(225);
  expect(runtimeErrors).toEqual([]);
});

test('keeps right-click gameplay local to the board and bounds the desktop scale', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });
  await page.goto('/');
  await page.evaluate(() => {
    (window as typeof window & { contextResults?: boolean[] }).contextResults =
      [];
    document.addEventListener('contextmenu', (event) => {
      (
        window as typeof window & { contextResults?: boolean[] }
      ).contextResults?.push(event.defaultPrevented);
    });
  });

  const firstCell = page.getByTestId('cell-0-0');
  await firstCell.click({ button: 'right' });
  await expect(firstCell).toHaveAccessibleName(/crossed/);
  await firstCell.click({ button: 'right' });
  await expect(firstCell).toHaveAccessibleName(/unknown/);

  const cellBox = await firstCell.boundingBox();
  expect(cellBox?.width).toBeGreaterThanOrEqual(22);
  expect(cellBox?.width).toBeLessThanOrEqual(38);
  expect((cellBox?.width ?? 0) * 15).toBeLessThanOrEqual(570);

  await page
    .getByRole('button', { name: 'Archive' })
    .click({ button: 'right' });
  const contextResults = await page.evaluate(
    () =>
      (window as typeof window & { contextResults?: boolean[] }).contextResults,
  );
  expect(contextResults?.slice(-3)).toEqual([true, true, false]);
});

test('ends gameplay drag when the pointer leaves and re-enters the board', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });
  await page.goto('/');
  const first = page.getByTestId('cell-0-0');
  const second = page.getByTestId('cell-0-1');
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();

  await page.mouse.move(firstBox!.x + 4, firstBox!.y + 4);
  await page.mouse.down();
  await page.mouse.move(5, 5);
  await page.mouse.move(secondBox!.x + 4, secondBox!.y + 4);
  await expect(second).toHaveAccessibleName(/unknown/);
  await page.mouse.up();
});

test('shows and clears a prominent wrong-guess penalty', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });
  await page.addInitScript(() => {
    localStorage.setItem(
      'daily-picross:v1',
      JSON.stringify({ theme: 'light', puzzles: {}, completions: [] }),
    );
  });
  await page.goto('/');
  await page.getByTestId('cell-0-0').click();
  const penalty = page.getByRole('status').filter({ hasText: '-3:00' });
  await expect(penalty).toBeVisible();
  await expect(penalty.locator('strong')).toHaveText('-3:00');
  await expect
    .poll(() =>
      penalty.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          foreground: styles.color,
          background: styles.backgroundColor,
        };
      }),
    )
    .toEqual({
      foreground: 'rgb(255, 255, 255)',
      background: 'rgb(163, 61, 80)',
    });
  await expect(penalty).toHaveCount(0, { timeout: 3000 });
});

test('marks a satisfied row reactively as its cells change', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });
  await page.goto('/');
  const rowClue = page.getByTestId('row-clue-1');
  await expect(rowClue).not.toHaveClass(/satisfied/);

  for (const x of [6, 7, 8]) await page.getByTestId(`cell-1-${x}`).click();
  await expect(rowClue).toHaveClass(/satisfied/);

  await page.getByTestId('cell-1-7').click();
  await expect(rowClue).not.toHaveClass(/satisfied/);
});

test('highlights the active row, column, and clue lines', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });
  await page.goto('/');
  const active = page.getByTestId('cell-4-6');
  const box = await active.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 4, box!.y + 4);

  await expect(active).toHaveClass(/active-row/);
  await expect(active).toHaveClass(/active-col/);
  await expect(page.getByTestId('row-clue-4')).toHaveClass(/active-row/);
  await expect(page.getByTestId('col-clue-6')).toHaveClass(/active-col/);
  await expect(page.getByTestId('cell-4-5')).toHaveClass(/active-row/);
  await expect(page.getByTestId('cell-3-6')).toHaveClass(/active-col/);
  await expect(page.getByTestId('cell-3-5')).not.toHaveClass(
    /active-row|active-col/,
  );

  await page.mouse.move(4, 4);
  await expect(
    page.locator('.picross .active-row, .picross .active-col'),
  ).toHaveCount(0);
});

test('preserves active projection through board rerenders', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });
  await page.goto('/');
  const active = page.getByTestId('cell-4-6');
  await active.hover();

  await active.click();
  await expect(active).toHaveClass(/active-row/);
  await expect(active).toHaveClass(/active-col/);
  await expect(page.getByTestId('row-clue-4')).toHaveClass(/active-row/);
  await expect(page.getByTestId('col-clue-6')).toHaveClass(/active-col/);
  await expect(page.getByTestId('cell-4-5')).toHaveClass(/active-row/);
  await expect(page.getByTestId('cell-3-6')).toHaveClass(/active-col/);

  await page.getByTestId('cell-4-7').hover();
  await expect(page.getByTestId('cell-4-7')).toHaveClass(/active-row/);
  await expect(page.getByTestId('cell-4-7')).toHaveClass(/active-col/);
  await expect(page.getByTestId('cell-4-6')).toHaveClass(/active-row/);
  await expect(page.getByTestId('cell-4-6')).not.toHaveClass(/active-col/);
});

test('keeps focus-visible distinct while keyboard navigation moves active lines', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });
  await page.goto('/');
  const focused = page.getByTestId('cell-4-6');
  await focused.focus();

  await expect(focused).toHaveClass(/active-row/);
  await expect(focused).toHaveClass(/active-col/);
  await expect(page.getByTestId('row-clue-4')).toHaveClass(/active-row/);
  await expect(page.getByTestId('col-clue-6')).toHaveClass(/active-col/);
  await expect
    .poll(() =>
      focused.evaluate((element) => getComputedStyle(element).outlineWidth),
    )
    .toBe('3px');
  await expect
    .poll(() =>
      page
        .getByTestId('cell-4-5')
        .evaluate((element) => getComputedStyle(element).outlineWidth),
    )
    .toBe('2px');

  await focused.press('ArrowRight');
  const next = page.getByTestId('cell-4-7');
  await expect(next).toBeFocused();
  await expect(next).toHaveClass(/active-row/);
  await expect(next).toHaveClass(/active-col/);
  await expect(page.getByTestId('col-clue-7')).toHaveClass(/active-col/);
  await expect(page.getByTestId('col-clue-6')).not.toHaveClass(/active-col/);

  await page.getByRole('button', { name: 'Reset' }).focus();
  await expect(
    page.locator('.picross .active-row, .picross .active-col'),
  ).toHaveCount(0);
});

test('shows placeholders before completion and formatted solve times after completion', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });
  await page.goto('/');
  await expect(page.locator('.stats')).toContainText('—');

  await page.evaluate(() => {
    localStorage.setItem(
      'daily-picross:v1',
      JSON.stringify({
        theme: 'light',
        puzzles: {},
        completions: [
          {
            puzzleId: 'p-2026-08-06-r2',
            date: '2026-08-06',
            elapsedMs: 125000,
          },
          {
            puzzleId: 'p-2026-08-07-r2',
            date: '2026-08-07',
            elapsedMs: 90000,
          },
        ],
      }),
    );
  });
  await page.reload();
  await expect(page.locator('.stats')).toContainText('1:47');
  await expect(page.locator('.stats')).toContainText('1:30');
});

test('keeps clue gutters contained and aligned with the board', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });
  await page.goto('/');
  const layout = await page.evaluate(() => {
    const picross = document.querySelector('.picross')!.getBoundingClientRect();
    const firstCell = document.querySelector('.cell')!.getBoundingClientRect();
    const firstColumnClue = document
      .querySelector('[data-testid="col-clue-0"]')!
      .getBoundingClientRect();
    const firstRowClue = document
      .querySelector('[data-testid="row-clue-0"]')!
      .getBoundingClientRect();
    return {
      picrossTop: picross.top,
      clueTop: firstColumnClue.top,
      clueBottom: firstColumnClue.bottom,
      rowLeft: firstRowClue.left,
      rowRight: firstRowClue.right,
      cellLeft: firstCell.left,
      cellTop: firstCell.top,
    };
  });
  expect(layout.clueTop).toBeGreaterThanOrEqual(layout.picrossTop - 1);
  expect(layout.clueBottom).toBeLessThanOrEqual(layout.cellTop + 1);
  expect(layout.rowLeft).toBeLessThanOrEqual(layout.cellLeft + 1);
  expect(layout.rowRight).toBeLessThanOrEqual(layout.cellLeft + 1);
});

test('shows bounded achievements and preserves unlocked state after reload', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });
  await page.addInitScript(() => {
    const board = Array.from({ length: 15 }, () =>
      Array<'unknown'>(15).fill('unknown'),
    );
    localStorage.setItem(
      'daily-picross:v1',
      JSON.stringify({
        puzzles: {
          'p-2026-08-08-r2': {
            board,
            tool: 'fill',
            history: [],
            future: [],
            startedAt: null,
            remainingMs: 2100000,
            penaltyMs: 0,
            elapsedMs: 0,
            completedAt: 2,
            failedAt: null,
          },
        },
        completions: [
          { puzzleId: 'p-2026-08-08-r2', date: '2026-08-08', elapsedMs: 1 },
        ],
        theme: 'system',
      }),
    );
  });
  await page.goto('/');
  await expect(
    page.getByRole('region', { name: 'Achievements' }),
  ).toContainText('First Solve');
  await expect(
    page.getByRole('region', { name: 'Achievements' }).locator('.unlocked'),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Achievements' }).locator('.unlocked'),
  ).toHaveCount(1);
});

const coffeeSolution = [
  '000000000000000',
  '000000111000000',
  '000001111100000',
  '000011111110000',
  '000011111110000',
  '000001111100000',
  '000001111100000',
  '000011111110000',
  '000111111111000',
  '001111111111100',
  '001111111111100',
  '000111111110000',
  '000011111100000',
  '000011111100000',
  '000000110000000',
];

const solvedBoard = (omit: [number, number] | null) =>
  coffeeSolution.map((row, y) =>
    [...row].map((cell, x) =>
      cell === '1' && (!omit || omit[0] !== y || omit[1] !== x)
        ? 'filled'
        : 'unknown',
    ),
  );

test('shows the solved art before the delayed result and supports dismissal/reopen', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });
  await page.addInitScript(
    (board) => {
      window.localStorage.setItem(
        'daily-picross:v1',
        JSON.stringify({
          puzzles: {
            'p-2026-08-08-r2': {
              board,
              tool: 'fill',
              history: [],
              future: [],
              startedAt: null,
              remainingMs: 2_000_000,
              penaltyMs: 0,
              elapsedMs: 0,
              completedAt: null,
              failedAt: null,
            },
          },
          completions: [],
          theme: 'system',
        }),
      );
    },
    solvedBoard([1, 6]),
  );
  await page.goto('/');

  await page.getByTestId('cell-1-6').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View result' })).toHaveCount(
    0,
  );
  await expect(page.locator('.reveal-art .cell.filled')).toHaveCount(92);
  await page.clock.fastForward(1799);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View result' })).toHaveCount(
    0,
  );
  await page.clock.fastForward(1);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
  await expect(
    page.getByRole('button', { name: 'Close completion result' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Share result' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'View archive' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Close completion result' }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    page.getByRole('button', { name: 'View archive' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View result' })).toBeFocused();

  await expect(page.locator('.reveal-art .cell.filled')).toHaveCount(92);
  await page.getByRole('button', { name: 'View result' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('keeps completion UI from leaking after navigating to the archive', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });
  await page.addInitScript(
    (board) => {
      window.localStorage.setItem(
        'daily-picross:v1',
        JSON.stringify({
          puzzles: {
            'p-2026-08-08-r2': {
              board,
              tool: 'fill',
              history: [],
              future: [],
              startedAt: null,
              remainingMs: 2_000_000,
              penaltyMs: 0,
              elapsedMs: 0,
              completedAt: null,
              failedAt: null,
            },
          },
          completions: [],
          theme: 'system',
        }),
      );
    },
    solvedBoard([1, 6]),
  );
  await page.goto('/');

  await page.getByTestId('cell-1-6').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible();
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('heading', { name: 'Archive' })).toBeVisible();

  await page.clock.fastForward(2000);
  await expect(page.getByRole('heading', { name: 'Archive' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('does not replay the result for an already-completed persisted puzzle', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });
  await page.addInitScript((board) => {
    window.localStorage.setItem(
      'daily-picross:v1',
      JSON.stringify({
        puzzles: {
          'p-2026-08-08-r2': {
            board,
            tool: 'fill',
            history: [],
            future: [],
            startedAt: 1,
            remainingMs: 1_000_000,
            penaltyMs: 0,
            elapsedMs: 1_100_000,
            completedAt: 2,
            failedAt: null,
          },
        },
        completions: [
          { puzzleId: 'p-2026-08-08-r2', date: '2026-08-08', elapsedMs: 1 },
        ],
        theme: 'system',
      }),
    );
  }, solvedBoard(null));
  await page.goto('/');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View result' })).toBeVisible();
});

test('resets all gameplay progress while preserving the theme preference', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });
  await page.addInitScript((board) => {
    window.localStorage.setItem(
      'daily-picross:v1',
      JSON.stringify({
        puzzles: {
          'p-2026-08-08-r2': {
            board,
            tool: 'fill',
            history: [],
            future: [],
            startedAt: 1,
            remainingMs: 1_000_000,
            penaltyMs: 0,
            elapsedMs: 1_100_000,
            completedAt: 2,
            failedAt: null,
          },
        },
        completions: [
          { puzzleId: 'p-2026-08-08-r2', date: '2026-08-08', elapsedMs: 1 },
        ],
        theme: 'dark',
      }),
    );
  }, solvedBoard(null));
  await page.goto('/');
  await page.getByRole('button', { name: 'Archive' }).click();
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain(
      'saved progress, solved history, and streak data',
    );
    void dialog.accept();
  });
  await page.getByRole('button', { name: 'Reset all progress' }).click();
  await expect(page.getByTestId('cell-0-0')).toHaveAccessibleName(/unknown/);
  await expect(
    page.getByText('All local progress has been reset.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText(/Unsolved/).first()).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('daily-picross:v1') ?? '{}'),
  );
  expect(saved.completions).toEqual([]);
  expect(saved.theme).toBe('dark');
});

test('provides a development-only current-puzzle replay reset', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-08T12:00:00Z') });
  await page.addInitScript((board) => {
    window.localStorage.setItem(
      'daily-picross:v1',
      JSON.stringify({
        puzzles: {
          'p-2026-08-08-r2': {
            board,
            tool: 'fill',
            history: [],
            future: [],
            startedAt: 1,
            remainingMs: 1_000_000,
            penaltyMs: 0,
            elapsedMs: 1_100_000,
            completedAt: 2,
            failedAt: null,
          },
        },
        completions: [
          { puzzleId: 'p-2026-08-08-r2', date: '2026-08-08', elapsedMs: 1 },
          { puzzleId: 'p-2026-08-07-r2', date: '2026-08-07', elapsedMs: 2 },
        ],
        theme: 'system',
      }),
    );
  }, solvedBoard(null));
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Replay current' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Replay current' }).click();
  await expect(page.getByTestId('cell-0-0')).toHaveAccessibleName(/unknown/);
  await expect(page.getByRole('button', { name: 'View result' })).toHaveCount(
    0,
  );
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('daily-picross:v1') ?? '{}'),
  );
  expect(saved.completions).toEqual([
    { puzzleId: 'p-2026-08-07-r2', date: '2026-08-07', elapsedMs: 2 },
  ]);
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText(/Unsolved/).first()).toBeVisible();
  await expect(page.getByText(/Solved/).first()).toBeVisible();
});

test('keeps primary navigation and reset access usable on a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');

  const pageWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(pageWidth).toBeLessThanOrEqual(360);
  await expect(page.getByText(/Daily Picross/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible();

  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('heading', { name: 'Archive' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Reset all progress' }),
  ).toBeVisible();
  const archivePageWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(archivePageWidth).toBeLessThanOrEqual(360);
});

test('keeps the playable board palette legible across theme modes', async ({
  page,
}) => {
  await page.goto('/');

  for (const mode of [
    { name: 'light', theme: 'light' as const, colorScheme: 'light' as const },
    { name: 'dark', theme: 'dark' as const, colorScheme: 'light' as const },
    {
      name: 'system-dark',
      theme: 'system' as const,
      colorScheme: 'dark' as const,
    },
  ]) {
    await test.step(mode.name, async () => {
      await page.emulateMedia({ colorScheme: mode.colorScheme });
      await page.evaluate((theme) => {
        const saved = JSON.parse(
          localStorage.getItem('daily-picross:v1') ?? '{}',
        );
        localStorage.setItem(
          'daily-picross:v1',
          JSON.stringify({ ...saved, theme }),
        );
      }, mode.theme);
      await page.reload();

      const palette = await page.locator('.grid-wrap').evaluate((element) => {
        const styles = getComputedStyle(element);
        const rowClue = element.querySelector('.row-clues');
        const cell = element.querySelector('.cell');
        const majorCell = element.querySelector('.cell.major-x');
        return {
          paper: styles.backgroundColor,
          ink: rowClue ? getComputedStyle(rowClue).color : '',
          grid: cell ? getComputedStyle(cell).borderTopColor : '',
          major: majorCell ? getComputedStyle(majorCell).borderRightColor : '',
          boardInk: styles.getPropertyValue('--board-ink').trim(),
          boardMajor: styles.getPropertyValue('--board-grid-major').trim(),
        };
      });

      // Option B intentionally keeps a physical light paper sheet in dark
      // chrome, so all board-local ink values must remain dark and distinct.
      expect(palette.paper).toBe('rgb(251, 246, 238)');
      expect(palette.ink).toBe('rgb(51, 43, 43)');
      expect(palette.grid).not.toBe(palette.paper);
      expect(palette.major).not.toBe(palette.paper);
      expect(palette.major).not.toBe(palette.grid);
      expect(palette.boardInk).toBe('#332b2b');
      expect(palette.boardMajor).toMatch(/^#(?:5e4f4a|574841)$/);
    });
  }
});

test('keeps status notices contrast-safe in dark and system-dark themes', async ({
  page,
}) => {
  await page.goto('/');

  for (const mode of [
    { name: 'dark', theme: 'dark' as const },
    { name: 'system-dark', theme: 'system' as const },
  ]) {
    await test.step(mode.name, async () => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.evaluate((theme) => {
        const saved = JSON.parse(
          localStorage.getItem('daily-picross:v1') ?? '{}',
        );
        localStorage.setItem(
          'daily-picross:v1',
          JSON.stringify({ ...saved, theme }),
        );
      }, mode.theme);
      await page.reload();
      page.once('dialog', (dialog) => void dialog.accept());
      await page.getByRole('button', { name: 'Reset' }).click();
      const colors = await page.locator('.notice').evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          foreground: styles.color,
          background: styles.backgroundColor,
          opacity: styles.opacity,
        };
      });
      expect(colors.opacity).toBe('1');
      expect(colors.foreground).not.toBe(colors.background);
      expect(colors.background).not.toBe('rgba(0, 0, 0, 0)');
    });
  }
});
