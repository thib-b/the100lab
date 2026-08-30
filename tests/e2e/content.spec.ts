import { test, expect } from '@playwright/test';
test('lie shows album + bandcamp embed', async ({ page }) => {
  await page.goto('/lie/');
  await expect(page.getByRole('heading', { name: "Living Isn't Easy" })).toBeVisible();
  await expect(page.locator('iframe[src*="bandcamp.com/EmbeddedPlayer"]')).toBeAttached();
});
test('bio shows the pull quote', async ({ page }) => {
  await page.goto('/bio/');
  await expect(page.getByText('Free-floating musical explorers')).toBeVisible();
});
test('video shows five youtube embeds', async ({ page }) => {
  await page.goto('/video/');
  await expect(page.locator('iframe[src*="youtube.com/embed"]')).toHaveCount(5);
});
test('image press shots load', async ({ page }) => {
  await page.goto('/image/');
  const img = page.locator('img[src="/assets/images/RQ1.jpeg"]');
  await expect(img).toBeVisible();
});
test('tour mounts the songkick widget', async ({ page }) => {
  await page.goto('/tour/');
  await expect(page.locator('#songkick-embed')).toBeAttached();
});
test('tour lists past tour dates', async ({ page }) => {
  await page.goto('/tour/');
  await expect(page.getByRole('heading', { name: 'Past Tour Dates' })).toBeVisible();
  await expect(page.getByText('Glastonbury Festival')).toBeVisible();
});
test('contact shows emails and mailchimp form', async ({ page }) => {
  await page.goto('/contact/');
  await expect(page.getByRole('link', { name: 'robocobraquartet@gmail.com' })).toBeVisible();
  await expect(page.locator('#mc-embedded-subscribe-form')).toBeAttached();
});
