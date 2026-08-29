import { test, expect } from '@playwright/test';
test('home renders nav with all sections', async ({ page }) => {
  await page.goto('/');
  for (const label of ['music','video','bio','tour','image','store','contact']) {
    await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
});
test('growth ground sets a seeded ground colour and canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#growth-ground canvas')).toBeAttached();
  const ground = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ground').trim());
  expect(ground).not.toBe('');
});
test('reduced-motion still renders a ground (no crash)', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage(); await page.goto('/');
  await expect(page.locator('#growth-ground canvas')).toBeAttached();
  await ctx.close();
});
