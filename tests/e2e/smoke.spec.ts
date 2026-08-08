import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'UTC' });

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
