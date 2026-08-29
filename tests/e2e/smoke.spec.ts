import { test, expect } from '@playwright/test';
test('home renders nav with all sections', async ({ page }) => {
  await page.goto('/');
  for (const label of ['music','video','bio','tour','image','store','contact']) {
    await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
});
