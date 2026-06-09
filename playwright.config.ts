/**
 * Playwright config — FAZA 1 storefront safety net.
 *
 * Strategy:
 *  - global-setup boots the Vendure mock on :9999 BEFORE the storefront
 *  - webServer launches `npm run preview` (production build) with
 *    VENDURE_API_URL pointed at the mock, so SSR fetches go to the mock
 *  - chromium-only, single worker for determinism (mock state is module-level)
 */

import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PORT || 4322);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  globalSetup: './tests/e2e/global-setup.ts',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    extraHTTPHeaders: {
      // Mark every Playwright-originated request — useful if we ever want
      // to short-circuit Meta CAPI / rate-limiter from the test client.
      'x-playwright-test': '1',
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],

  // Vercel adapter has no `astro preview`, so we drive `astro dev` against the
  // mock backend. SSR pipeline is the same as production — same checkout.astro
  // module, same import resolution. The CI workflow runs `npm run build` BEFORE
  // tests so we still catch build-time errors separately.
  webServer: {
    command: `cross-env VENDURE_API_URL=http://localhost:9999/shop-api VENDURE_CHANNEL_TOKEN=mock-token PUBLIC_SITE_URL=${BASE_URL} astro dev --host 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
