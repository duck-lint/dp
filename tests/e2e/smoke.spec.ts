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
