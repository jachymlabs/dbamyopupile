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
  "http://localhost:4321",
  "http://127.0.0.1:4321",
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
  const origin = request.headers.get("origin");
  if (!origin) {
    // No Origin header — rely on SameSite=Lax cookie. Common for:
    // - Same-origin GET (browsers don't send Origin on GET)
    // - Server-side fetch / curl
    return null;
  }

  // PRIMARY CHECK: same-origin policy — Origin host == request host.
  // Self-healing: dziala niezaleznie od env / aliasu / domeny / PUBLIC_SITE_URL.
  // Browser zawsze wysyla Origin z hostu strony, wiec POST z dbamyopupile.pl na dbamyopupile.pl
  // przejdzie automatycznie. Cross-origin POST (np. evil.com → dbamyopupile.pl) zawsze blokowany.
  try {
    const requestHost = new URL(request.url).host;
    const originHost = new URL(origin).host;
    if (originHost === requestHost) return null;
  } catch {
    // Malformed URL → fall through to allowlist
  }

  // SECONDARY CHECK: explicit allowlist z env (dla cross-origin scenarios np. iframe checkout, CDN).
  const configuredOrigins = (
    import.meta.env.PUBLIC_SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    ""
  )
    .trim()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const allowed of configuredOrigins) {
    if (origin === allowed || origin.startsWith(allowed + "/")) return null;
  }

  // Dev fallback: localhost.
  if (!import.meta.env.PROD && ALLOWED_FALLBACK_ORIGINS.includes(origin)) {
    return null;
  }

  console.warn("[security] assertSameOrigin: blocked origin", {
    origin,
    requestUrl: request.url,
  });
  return new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Payment metadata sanitization ─────────────────────────────────

/**
 * Fields that are SAFE to expose in payment.metadata responses (storefront read path).
 * Anything not in this list is stripped — including any BLIK auth code that may have
 * leaked back from the Vendure payment plugin.
 *
 * BLIK authorization codes (6 digits) are SINGLE-USE secrets — once consumed by PayU
 * they have no business value, and storing/transmitting them increases the blast radius
 * if logs leak. Even if the Vendure plugin echoes them back via `addPaymentToOrder`,
 * we never let them reach the client or downstream consumers.
 *
 * Public-only keys (added under `metadata.public` by Vendure plugin):
 *  - redirectUri      : PayU redirect target for REDIRECT/PAYPO flows
 *  - statusCode       : PayU response status (e.g. SUCCESS, WARNING_CONTINUE_3DS)
 *  - extOrderId       : External order ID
 *  - orderId          : PayU orderId
 */
const PUBLIC_PAYMENT_METADATA_KEYS = new Set([
  "redirectUri",
  "statusCode",
  "extOrderId",
  "orderId",
  "paymentId",
  "transactionId",
]);

const FORBIDDEN_PAYMENT_METADATA_KEYS = new Set([
  "blikCode",
  "blikAuthCode",
  "authCode",
  "cardNumber",
  "cvv",
  "cvc",
]);

/**
 * Sanitize a single payment.metadata object — strip secrets, keep only whitelisted public keys.
 * Returns a NEW object; does not mutate input.
 */
export function sanitizePaymentMetadata(
  metadata: unknown,
): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") return {};
  const src = metadata as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  // Top-level: only allow whitelisted public keys, never forbidden keys.
  for (const [key, val] of Object.entries(src)) {
    if (FORBIDDEN_PAYMENT_METADATA_KEYS.has(key)) continue;
    if (key === "public" && val && typeof val === "object") {
      // Nested public object — also filter
      const pub = val as Record<string, unknown>;
      const cleanPub: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(pub)) {
        if (FORBIDDEN_PAYMENT_METADATA_KEYS.has(pk)) continue;
        if (PUBLIC_PAYMENT_METADATA_KEYS.has(pk)) cleanPub[pk] = pv;
      }
      out.public = cleanPub;
      continue;
    }
    if (PUBLIC_PAYMENT_METADATA_KEYS.has(key)) {
      out[key] = val;
    }
    // Anything else (private, unknown) is dropped silently.
  }
  return out;
}

/**
 * Sanitize an array of payment objects in-place-friendly (returns new array).
 * Use on `order.payments` before any logging/serialization to clients.
 */
export function sanitizePaymentsArray<T extends { metadata?: unknown }>(
  payments: T[] | undefined | null,
): T[] {
  if (!Array.isArray(payments)) return [];
  return payments.map((p) => ({
    ...p,
    metadata: sanitizePaymentMetadata(p.metadata),
  }));
}
