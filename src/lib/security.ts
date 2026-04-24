/**
 * Security helpers — CSRF, origin validation, etc.
 *
 * Layered defense:
 *  - Primary: SameSite=Lax cookies on session token (set by Vendure / vendure-api).
 *  - Secondary: Origin header check on state-changing API endpoints.
 *
 * Use `assertSameOrigin()` in every POST/PUT/PATCH/DELETE API route that
 * mutates server state (cart, coupon, checkout submission, etc.).
 */

const ALLOWED_FALLBACK_ORIGINS = [
  'http://localhost:4321',
  'http://127.0.0.1:4321',
];

/**
 * Returns null if origin is allowed, or a Response (403) if it should be blocked.
 *
 * Behavior:
 *  - No `Origin` header at all → allowed (legacy clients, server-to-server, GET-style fetch).
 *    SameSite=Lax cookie is the primary CSRF defense in that case.
 *  - `Origin` present and matches `PUBLIC_SITE_URL` → allowed.
 *  - In dev (no PROD env): also allow localhost variants.
 *  - In prod with no `PUBLIC_SITE_URL` configured → BLOCK (fail-closed, log).
 *  - Origin present and doesn't match → BLOCK.
 *
 * @example
 *   export const POST: APIRoute = async ({ request }) => {
 *     const blocked = assertSameOrigin(request);
 *     if (blocked) return blocked;
 *     // ... rest of handler
 *   };
 */
export function assertSameOrigin(request: Request): Response | null {
  const origin = request.headers.get('origin');
  if (!origin) {
    // No Origin header — rely on SameSite=Lax cookie. Common for:
    // - Same-origin GET (browsers don't send Origin on GET)
    // - Server-side fetch / curl
    // For consistency, we let it through; CSRF is mitigated by cookie attributes.
    return null;
  }

  const allowedOrigin = (
    import.meta.env.PUBLIC_SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    ''
  ).trim();

  // Production: require PUBLIC_SITE_URL to be set.
  if (!allowedOrigin) {
    if (import.meta.env.PROD) {
      console.error('[security] assertSameOrigin: PUBLIC_SITE_URL not set in production — rejecting request');
      return new Response('Forbidden', { status: 403 });
    }
    // Dev fallback: accept localhost.
    if (ALLOWED_FALLBACK_ORIGINS.includes(origin)) return null;
    return new Response('Forbidden', { status: 403 });
  }

  // Compare exact prefix (protocol + host[:port]). Avoids `https://evil-allowed.com` style bypass.
  if (origin === allowedOrigin || origin.startsWith(allowedOrigin + '/')) {
    return null;
  }

  // Dev: also allow localhost in addition to configured PUBLIC_SITE_URL.
  if (!import.meta.env.PROD && ALLOWED_FALLBACK_ORIGINS.includes(origin)) {
    return null;
  }

  console.warn('[security] assertSameOrigin: blocked origin', { origin, allowedOrigin });
  return new Response('Forbidden', { status: 403 });
}
