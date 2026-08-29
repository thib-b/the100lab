import { test, expect } from '@playwright/test';
test('growth canvas persists across client-side navigation', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => ((window as any).__gid = document.querySelector('#growth-ground canvas')));
  await page.getByRole('link', { name: 'bio', exact: true }).click();
  await expect(page).toHaveURL(/\/bio\/?$/);
  const same = await page.evaluate(() => (window as any).__gid === document.querySelector('#growth-ground canvas'));
  expect(same).toBe(true); // same canvas node survived the transition (never restarted)
});
