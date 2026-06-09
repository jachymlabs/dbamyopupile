/**
 * Playwright global setup — boots the Vendure mock server before tests start
 * and tears it down after the run.
 *
 * The mock listens on http://localhost:9999/shop-api. Storefront preview is
 * launched with VENDURE_API_URL pointing here (see playwright.config.ts).
 */

import { startMockServer, type MockServerHandle } from '../mocks/vendure-mock';

let handle: MockServerHandle | null = null;

async function globalSetup(): Promise<() => Promise<void>> {
  const port = Number(process.env.MOCK_PORT || 9999);
  handle = await startMockServer(port);
  // eslint-disable-next-line no-console
  console.log(`[global-setup] Vendure mock up on ${handle.url}`);

  return async () => {
    if (handle) {
      await handle.close();
      // eslint-disable-next-line no-console
      console.log('[global-setup] Vendure mock closed');
    }
  };
}

export default globalSetup;
