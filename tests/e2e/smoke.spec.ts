import { test, expect } from '@playwright/test';
test('opens the daily puzzle and archive', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Daily Picross/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible();
});
