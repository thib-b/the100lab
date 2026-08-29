import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  // Astro's dev/preview server reads stdin for interactive shortcuts and exits under
  // Playwright's non-TTY spawn, so serve the built static output with a plain server instead.
  webServer: { command: 'npm run build && python3 -m http.server 4321 --directory dist', url: 'http://localhost:4321', reuseExistingServer: !process.env.CI, timeout: 120000 },
  use: { baseURL: 'http://localhost:4321' },
});
