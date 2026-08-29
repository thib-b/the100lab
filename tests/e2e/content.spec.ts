import { test, expect } from '@playwright/test';
test('home shows album + bandcamp embed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Living Isn't Easy" })).toBeVisible();
  await expect(page.locator('iframe[src*="bandcamp.com/EmbeddedPlayer"]')).toBeAttached();
});
test('bio shows the pull quote', async ({ page }) => {
  await page.goto('/bio/');
  await expect(page.getByText('Free-floating musical explorers')).toBeVisible();
});
