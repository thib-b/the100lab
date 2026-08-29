import { test, expect } from '@playwright/test';
test('growth canvas persists across client-side navigation', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => ((window as any).__gid = document.querySelector('#growth-ground canvas')));
  await page.getByRole('link', { name: 'bio', exact: true }).click();
  await expect(page).toHaveURL(/\/bio\/?$/);
  const same = await page.evaluate(() => (window as any).__gid === document.querySelector('#growth-ground canvas'));
  expect(same).toBe(true); // same canvas node survived the transition (never restarted)
});

test('songkick widget mounts after client-side nav to /tour/', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'tour', exact: true }).click();
  await expect(page).toHaveURL(/\/tour\/?$/);
  await expect(page.locator('#songkick-widget-8269433-3837')).toBeAttached();
});

test('mailchimp form mounts after client-side nav to /contact/', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'contact', exact: true }).click();
  await expect(page).toHaveURL(/\/contact\/?$/);
  await expect(page.locator('#mc-embedded-subscribe-form')).toBeAttached();
});
