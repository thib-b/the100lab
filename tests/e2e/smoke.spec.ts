import { test, expect } from '@playwright/test';
test('home renders nav with all sections', async ({ page }) => {
  await page.goto('/');
  for (const label of ['video','bio','tour','image','store','contact']) {
    await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'music', exact: true })).toHaveCount(0);
});
test('splash shows The Hundred and not the album page, /lie/ is reachable directly', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'THE HUNDRED' })).toBeVisible();
  await expect(page.getByRole('heading', { name: "Living Isn't Easy" })).toHaveCount(0);
  await page.goto('/lie/');
  await expect(page.getByRole('heading', { name: "Living Isn't Easy" })).toBeVisible();
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
