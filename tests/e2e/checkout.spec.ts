/**
 * Faza 1 — checkout regression net.
 *
 * Goal: catch import / runtime errors in checkout.astro POST handler
 * before they reach Vercel. The 4h debug session of 2026-04-28 was caused
 * by a missing `redirectWithToken` import — Astro frontmatter is loose TS,
 * `astro check` didn't flag it, the page only crashed at runtime when a
 * customer tried to submit. These tests run the full SSR POST flow against
 * a mock Vendure backend.
 *
 * Each test:
 *  1. Resets mock state (POST /__test__/reset)
 *  2. Optionally seeds an active order (POST /__test__/seed-cart)
 *  3. Hits a storefront page or submits a checkout form
 *  4. Asserts response status + body invariants
 *
 * The CRITICAL assertion across all submit paths is:
 *   "response body MUST NOT contain 'Wystąpił nieoczekiwany błąd'"
 * — that's the canary text from checkout.astro:406 catch block. Anything
 * that throws inside the POST handler (missing import, undefined function,
 * shape mismatch from a refactor) lands there.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';

const MOCK_BASE = process.env.MOCK_BASE_URL || 'http://localhost:9999';
const STOREFRONT_ORIGIN = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4322';

async function resetMock(request: APIRequestContext): Promise<void> {
  const r = await request.post(`${MOCK_BASE}/__test__/reset`);
  expect(r.ok(), 'mock /__test__/reset failed').toBeTruthy();
}

async function seedCart(request: APIRequestContext): Promise<void> {
  const r = await request.post(`${MOCK_BASE}/__test__/seed-cart`, { data: {} });
  expect(r.ok(), 'mock /__test__/seed-cart failed').toBeTruthy();
}

// ───────────────────── TEST 1: Smoke pages ─────────────────────────

test.describe('smoke pages', () => {
  test.beforeEach(async ({ request }) => {
    await resetMock(request);
  });

  test('home page renders 200 with title', async ({ page }) => {
    const resp = await page.goto('/');
    expect(resp?.status(), 'home status').toBe(200);
    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/dbamyopupile|wolnamiska|miska|pies/);
  });

  test('koszyk page renders 200 (empty cart)', async ({ request }) => {
    const resp = await request.get(`${STOREFRONT_ORIGIN}/koszyk`);
    expect(resp.status(), 'koszyk status').toBe(200);
  });

  test('checkout with empty cart redirects to /koszyk', async ({ request }) => {
    const resp = await request.get(`${STOREFRONT_ORIGIN}/checkout`, { maxRedirects: 0 });
    // Astro returns 302 to /koszyk when activeOrder has no lines.
    expect([200, 302, 301]).toContain(resp.status());
    if (resp.status() === 302 || resp.status() === 301) {
      expect(resp.headers()['location'] || '').toContain('/koszyk');
    }
  });
});

// ───────────────────── TEST 2: PayU REDIRECT (paczkomat) ───────────

test('checkout PayU REDIRECT — paczkomat happy path', async ({ request }) => {
  await resetMock(request);
  await seedCart(request);

  // Sanity — checkout GET renders 200 once the cart is seeded.
  const getResp = await request.get(`${STOREFRONT_ORIGIN}/checkout`);
  expect(getResp.status(), 'checkout GET status').toBe(200);

  // Submit POST. Origin header MUST match request host (assertSameOrigin).
  const form = new URLSearchParams();
  form.set('email', 'test@example.com');
  form.set('phone', '600100200');
  form.set('fullName', 'Anna Kowalska');
  form.set('shippingMethodId', 'sm-1'); // Paczkomat InPost
  form.set('inpostLockerId', 'WAW01A');
  form.set('paymentMethodCode', 'payu');
  form.set('flowType', 'REDIRECT');
  form.set('acceptTerms', 'on');

  const postResp = await request.post(`${STOREFRONT_ORIGIN}/checkout`, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: STOREFRONT_ORIGIN,
    },
    data: form.toString(),
    maxRedirects: 0,
  });

  // Expect 302 to PayU.
  expect(postResp.status(), 'checkout POST status').toBe(302);
  const location = postResp.headers()['location'] || '';
  expect(location, 'PayU redirect location').toMatch(/^https:\/\/secure\.payu\.com\//);

  // CANARY: body of the response must not contain the catch-block text.
  // 302 responses usually have empty body — but if a throw happened earlier,
  // the page renders a 200 with the error banner instead of redirecting.
  const body = await postResp.text();
  expect(body, 'response should not contain crash banner').not.toContain('Wystąpił nieoczekiwany błąd');
});

// ───────────────────── TEST 3: COD (pobranie) ──────────────────────

test('checkout COD — pobranie kurier happy path', async ({ request }) => {
  await resetMock(request);
  await seedCart(request);

  const form = new URLSearchParams();
  form.set('email', 'test@example.com');
  form.set('phone', '600100200');
  form.set('fullName', 'Jan Nowak');
  form.set('shippingMethodId', 'sm-3'); // Pobranie kurier
  form.set('street', 'ul. Testowa 1');
  form.set('city', 'Warszawa');
  form.set('postalCode', '00-001');
  form.set('paymentMethodCode', 'cod');
  form.set('flowType', '');
  form.set('acceptTerms', 'on');

  const postResp = await request.post(`${STOREFRONT_ORIGIN}/checkout`, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: STOREFRONT_ORIGIN,
    },
    data: form.toString(),
    maxRedirects: 0,
  });

  expect(postResp.status(), 'checkout COD POST status').toBe(302);
  const location = postResp.headers()['location'] || '';
  expect(location, 'COD redirect location').toMatch(/^\/potwierdzenie\?code=/);

  const body = await postResp.text();
  expect(body, 'response should not contain crash banner').not.toContain('Wystąpił nieoczekiwany błąd');
});

// ───────────────────── TEST 4: Potwierdzenie page ──────────────────

test('potwierdzenie renders order details from mock', async ({ request, page }) => {
  await resetMock(request);
  await seedCart(request);

  // Force the order into a settled state by running a COD checkout first.
  const form = new URLSearchParams();
  form.set('email', 'test@example.com');
  form.set('phone', '600100200');
  form.set('fullName', 'Jan Nowak');
  form.set('shippingMethodId', 'sm-3');
  form.set('street', 'ul. Testowa 1');
  form.set('city', 'Warszawa');
  form.set('postalCode', '00-001');
  form.set('paymentMethodCode', 'cod');
  form.set('flowType', '');
  form.set('acceptTerms', 'on');

  const postResp = await request.post(`${STOREFRONT_ORIGIN}/checkout`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: STOREFRONT_ORIGIN },
    data: form.toString(),
    maxRedirects: 0,
  });
  expect(postResp.status()).toBe(302);

  // Visit potwierdzenie. Use page (not request) so we can inspect rendered HTML.
  const resp = await page.goto(`/potwierdzenie?code=MOCK_TEST_001`);
  expect(resp?.status(), 'potwierdzenie status').toBe(200);
  const content = await page.content();
  expect(content).toMatch(/Dziękujemy|Sprawdź, czy/);
  expect(content).toContain('MOCK_TEST_001');
});
