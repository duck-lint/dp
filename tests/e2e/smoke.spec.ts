import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'UTC' });

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

test('authoring lab loads seeds and protects immutable identity on export', async ({
  page,
}) => {
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
});

test('opens the daily puzzle and archive', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Daily Picross/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible();
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
