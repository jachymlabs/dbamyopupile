/**
 * Wspólne wzorce dla endpointów /api/cart/*.ts
 *
 * Każdy endpoint cart (POST /api/cart, /adjust, /remove, /coupon) miał
 * zduplikowane:
 *  - CSRF check (assertSameOrigin)
 *  - rate-limit per IP
 *  - try/catch z 500 fallback
 *  - JSON body parser z early-return na błąd
 *
 * Tutaj wyciągamy te wzorce. Logika biznesowa specyficzna dla endpointu
 * (kompozycja mutacji, lock per token) zostaje inline, żeby nie ukrywać
 * złożoności behind generic helper.
 */

import { isRateLimitedAsync } from "./rate-limit";
import { assertSameOrigin } from "./security";
import { buildResponse } from "./vendure-api";

// ─── Rate limit / origin / error wrapper ───────────────────────────

export type CartGuardOptions = {
  /** Identyfikator dla rate-limit bucket (np. "cart-add", "cart-adjust") */
  rateLimitKey: string;
  /** Liczba dozwolonych requestów w oknie. Default: 30. */
  rateLimitMax?: number;
  /** Okno w ms. Default: 60_000 (1 min). */
  rateLimitWindowMs?: number;
};

/**
 * HOC opakowujący handler endpointu cart o:
 *  - assertSameOrigin (CSRF secondary defense)
 *  - rate-limit per IP
 *  - try/catch z 500 fallback i logiem
 *
 * @example
 *   export const POST = withCartGuards(
 *     { rateLimitKey: 'cart-adjust' },
 *     async ({ request }) => {
 *       const body = await parseCartBody(request);
 *       if ('error' in body) return body.error;
 *       // ... handler logic
 *     }
 *   );
 */
export function withCartGuards(
  opts: CartGuardOptions,
  handler: (ctx: { request: Request }) => Promise<Response>,
) {
  return async ({ request }: { request: Request }): Promise<Response> => {
    // 1. CSRF: secondary defense (primary is SameSite=Lax cookie).
    const blocked = assertSameOrigin(request);
    if (blocked) return blocked;

    // 2. Rate limit per IP.
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limited = await isRateLimitedAsync(
      ip,
      opts.rateLimitKey,
      opts.rateLimitMax ?? 30,
      opts.rateLimitWindowMs ?? 60_000,
    );
    if (limited) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Handler z 500 fallback.
    try {
      return await handler({ request });
    } catch (err) {
      console.error(
        `[cart:${opts.rateLimitKey}] internal error`,
        err instanceof Error ? err.message : err,
      );
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}

/**
 * Parsuje JSON body lub zwraca gotowy 400 Response.
 *
 * @example
 *   const body = await parseCartBody<{ lineId: string }>(request);
 *   if ('error' in body) return body.error;
 *   const { lineId } = body.data;
 */
export async function parseCartBody<T = any>(
  request: Request,
): Promise<{ data: T } | { error: Response }> {
  try {
    const data = (await request.json()) as T;
    return { data };
  } catch {
    return {
      error: buildResponse({ order: null, error: "Invalid request body" }),
    };
  }
}
