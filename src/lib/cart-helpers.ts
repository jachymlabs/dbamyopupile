/**
 * Wspólne wzorce dla endpointów /api/cart/*.ts
 *
 * Każdy endpoint cart (POST /api/cart, /adjust, /remove, /coupon) miał
 * zduplikowane:
 *  - CSRF check (assertSameOrigin)
 *  - rate-limit per IP
 *  - try/catch z 500 fallback
 *  - JSON body parser z early-return na błąd
 *  - identyczne stałe TRIGGER_VARIANT_ID / BONUS_VARIANT_ID
 *
 * Tutaj wyciągamy te wzorce. Logika biznesowa specyficzna dla endpointu
 * (kompozycja mutacji, lock per token, dedup bonusu) zostaje inline,
 * żeby nie ukrywać złożoności behind generic helper.
 */

import { isRateLimitedAsync } from './rate-limit';
import { assertSameOrigin } from './security';
import { buildResponse, vendureQuery } from './vendure-api';

// ─── Konfiguracja bonus ebook ───────────────────────────────────────
// Auto-add config: kupno WolnaMiska (variant 21) → automatycznie
// dorzucamy Ebook (variant 23) do koszyka. Cena 0 dzięki Vendure promotion.
// Usuwany automatycznie gdy WolnaMiska znika z koszyka.
export const TRIGGER_VARIANT_ID = '21'; // WolnaMiska
export const BONUS_VARIANT_ID = '23';   // Ebook 30 przepisów

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
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const limited = await isRateLimitedAsync(
      ip,
      opts.rateLimitKey,
      opts.rateLimitMax ?? 30,
      opts.rateLimitWindowMs ?? 60_000,
    );
    if (limited) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Handler z 500 fallback.
    try {
      return await handler({ request });
    } catch (err) {
      console.error(`[cart:${opts.rateLimitKey}] internal error`, err instanceof Error ? err.message : err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
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
    return { error: buildResponse({ order: null, error: 'Invalid request body' }) };
  }
}

// ─── Bonus ebook auto-sync ─────────────────────────────────────────

const REMOVE_LINE = `mutation RemoveLine($lineId: ID!) {
  removeOrderLine(orderLineId: $lineId) { __typename ... on Order { id } }
}`;

/**
 * Auto-usuwa bonus ebook z koszyka jeśli trigger product (WolnaMiska) zniknął.
 * Idempotentne — bezpieczne wywołanie nawet gdy trigger nadal w koszyku
 * (po prostu nic nie robi).
 *
 * Używane przez /api/cart/remove. Auto-add bonusa zostaje inline w /api/cart
 * (POST), bo jest spleciony z per-token lock i dedup logic.
 *
 * @returns nowy `order` po ewentualnym remove + nowy token (jeśli rotował)
 */
export async function syncBonusEbookOnRemove(
  order: any,
  activeToken: string | undefined,
): Promise<{ order: any; activeToken: string | undefined }> {
  if (!order || order.__typename !== 'Order') return { order, activeToken };

  const hasTrigger = order.lines?.some(
    (l: any) => l.productVariant?.id === TRIGGER_VARIANT_ID,
  );
  const bonusLine = order.lines?.find(
    (l: any) => l.productVariant?.id === BONUS_VARIANT_ID,
  );

  // Trigger nadal jest LUB bonusa nigdy nie było → nic do roboty.
  if (hasTrigger || !bonusLine || !activeToken) {
    return { order, activeToken };
  }

  try {
    const resp = await vendureQuery(REMOVE_LINE, { lineId: bonusLine.id }, activeToken);
    const result = resp.data?.removeOrderLine;
    if (result?.__typename === 'Order') {
      return { order: result, activeToken: resp.newToken || activeToken };
    }
  } catch {
    // Best-effort cleanup — jeśli remove bonusu się wywali, zwróć niezmienione.
  }
  return { order, activeToken };
}
