import { test, expect } from '@playwright/test';

// Regression: the reCAPTCHA v3 badge (added with the EmailOctopus embed) is position:fixed and hangs
// ~168px off the right edge on mobile, which made the page scroll sideways and pushed the
// viewport-fixed GrowthGround "stamp" off-centre. BaseLayout's html,body{overflow-x:hidden} clips it.
test.use({ viewport: { width: 390, height: 844 } });

for (const path of ['/', '/contact/']) {
  test(`no horizontal scroll on mobile at ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(2500); // let the async embed + recaptcha badge inject

    const m = await page.evaluate(() => {
      const se = document.scrollingElement as HTMLElement; // the viewport scroller (html)
      // try to force a horizontal scroll; overflow-x:hidden must stop the viewport from panning
      se.scrollLeft = 9999;
      return {
        scrollWidth: se.scrollWidth,
        clientWidth: se.clientWidth,
        scrollLeft: se.scrollLeft,
      };
    });
    // the viewport scroller has no horizontal overflow, and the user cannot pan it sideways
    expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
    expect(m.scrollLeft).toBe(0);
  });
}

test('growth stamp canvas is centred on the viewport (mobile)', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2500);
  const box = await page.locator('#growth-ground canvas').first().boundingBox();
  expect(box).toBeTruthy();
  // fixed, inset:0 → the canvas fills the viewport, so its centre is the screen centre
  expect(Math.abs(box!.x)).toBeLessThan(2);
  expect(Math.abs(box!.width - 390)).toBeLessThan(2);
});
