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
 *
 * Bonus ebook flow:
 *  - TRIGGER = łączna ilość wariantów Moodles w koszyku ≥ TRIGGER_THRESHOLD (2)
 *  - BONUS = ebook 'miniprzewodnik', auto-dodany za 0 zł (Vendure promotion),
 *    qty zawsze 1, blokowany przed remove/adjust z frontu
 *  - Reconcile uruchamiany po KAŻDEJ zmianie koszyka (add / adjust / remove)
 */

import { isRateLimitedAsync } from "./rate-limit";
import { assertSameOrigin } from "./security";
import { buildResponse, vendureQuery, ORDER_FRAGMENT } from "./vendure-api";

// ─── Konfiguracja bonus ebook ───────────────────────────────────────
// dbamyopupile: 2+ zestawy Moodles w koszyku → darmowy ebook 'Miniprzewodnik'.
// Jeśli kiedyś zmienimy produkt/próg — tylko stałe niżej.
//
// SETUP w Vendure admin:
//  1. Products → Miniprzewodnik wariant zostaje na cenie katalogowej (np. 29,99 zł)
//  2. Marketing → Promotions → New Promotion:
//     - Coupon code: BONUS_COUPON_CODE (wartość niżej)
//     - Conditions: (opcjonalnie) "Cart contains 2+ Moodles" jako extra guard
//     - Actions: "Discount specific products" → wybierz Miniprzewodnik → 100%
//  3. Save & activate
// Nasz kod auto-aplikuje ten coupon w reconcileBonus gdy próg osiągnięty,
// auto-usuwa gdy spadnie.
export const TRIGGER_PRODUCT_SLUG = "moodles";
export const TRIGGER_THRESHOLD = 2;
export const BONUS_PRODUCT_SLUG = "miniprzewodnik";
export const BONUS_COUPON_CODE = "MOODLES_GIFT";

// ─── Konfiguracja darmowej dostawy ──────────────────────────────────
// Próg subTotalWithTax (z VATem) w groszach. Od 9900 (99 zł) → free shipping.
//
// SETUP w Vendure admin (osobna promotion):
//  1. Marketing → Promotions → New Promotion:
//     - Name: "Darmowa dostawa od 99 zł"
//     - Coupon code: FREE_SHIPPING_COUPON_CODE (wartość niżej)
//     - Conditions: (puste — nasz kod sprawdza próg)
//     - Actions: "Free shipping" (zwykle dropdown w admin UI)
//  2. Save & activate
// Nasz kod auto-aplikuje coupon gdy subTotalWithTax ≥ progu, auto-usuwa gdy spadnie.
export const FREE_SHIPPING_THRESHOLD_GROSZE = 9900;
export const FREE_SHIPPING_COUPON_CODE = "FREE_SHIP_99";

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

// ─── Bonus ebook auto-sync ─────────────────────────────────────────

const ADD_BONUS_MUTATION = `mutation AddBonus($variantId: ID!, $quantity: Int!) {
  addItemToOrder(productVariantId: $variantId, quantity: $quantity) {
    __typename
    ... on Order { ${ORDER_FRAGMENT} }
    ... on ErrorResult { errorCode message }
  }
}`;

const REMOVE_LINE = `mutation RemoveLine($lineId: ID!) {
  removeOrderLine(orderLineId: $lineId) { __typename ... on Order { id } }
}`;

const ADJUST_LINE = `mutation AdjustLine($lineId: ID!, $quantity: Int!) {
  adjustOrderLine(orderLineId: $lineId, quantity: $quantity) { __typename ... on Order { id } }
}`;

const APPLY_COUPON_MUTATION = `mutation ApplyBonusCoupon($couponCode: String!) {
  applyCouponCode(couponCode: $couponCode) {
    __typename
    ... on Order { id couponCodes }
    ... on CouponCodeExpiredError { errorCode }
    ... on CouponCodeInvalidError { errorCode }
    ... on CouponCodeLimitError { errorCode }
  }
}`;

const REMOVE_COUPON_MUTATION = `mutation RemoveBonusCoupon($couponCode: String!) {
  removeCouponCode(couponCode: $couponCode) {
    __typename
    ... on Order { id couponCodes }
  }
}`;

const GET_ACTIVE_ORDER = `query { activeOrder { ${ORDER_FRAGMENT} } }`;

const RESOLVE_BONUS_QUERY = `query ResolveBonus($slug: String!) {
  product(slug: $slug) {
    id
    variants { id }
  }
}`;

// Cache: slug → variant ID. Per-instance (cold start clears). Bonus variant
// nie zmienia ID w trakcie życia procesu, więc 1x query starczy.
// Cache'ujemy TYLKO positive hit — żeby transient network error nie wyłączał
// promo na całe życie procesu.
let cachedBonusVariantId: string | null = null;

async function resolveBonusVariantId(
  token: string | undefined,
): Promise<string | null> {
  if (cachedBonusVariantId) return cachedBonusVariantId;
  try {
    const { data } = await vendureQuery<any>(
      RESOLVE_BONUS_QUERY,
      { slug: BONUS_PRODUCT_SLUG },
      token,
    );
    const vid = data?.product?.variants?.[0]?.id ?? null;
    if (vid) cachedBonusVariantId = vid;
    return vid;
  } catch {
    return null;
  }
}

/** Łączna ilość wariantów Moodles w koszyku (suma qty po wszystkich liniach). */
export function getTriggerTotalQty(order: any): number {
  if (!order?.lines) return 0;
  return order.lines
    .filter(
      (l: any) => l.productVariant?.product?.slug === TRIGGER_PRODUCT_SLUG,
    )
    .reduce((sum: number, l: any) => sum + (l.quantity || 0), 0);
}

/** Czy linia to bonus ebook (slug match)? */
export function isBonusLine(line: any): boolean {
  return line?.productVariant?.product?.slug === BONUS_PRODUCT_SLUG;
}

/** Wszystkie linie bonusowe w koszyku (powinno być 0 lub 1 — dedup robi reconcile). */
function findAllBonusLines(order: any): any[] {
  if (!order?.lines) return [];
  return order.lines.filter((l: any) => isBonusLine(l));
}

/** Czy w koszyku jest aplikowany nasz bonus coupon? */
function hasBonusCoupon(order: any): boolean {
  return (
    Array.isArray(order?.couponCodes) &&
    order.couponCodes.includes(BONUS_COUPON_CODE)
  );
}

/**
 * Single source of truth dla bonus state. Wywoływane PO każdej zmianie koszyka
 * (add / adjust / remove). Doprowadza koszyk do poprawnego stanu:
 *  - trigger qty ≥ threshold AND zero bonus  → ADD bonus
 *  - trigger qty < threshold AND has bonus   → REMOVE bonus(y)
 *  - trigger qty ≥ threshold AND >1 bonus    → dedup, zostaw 1 z qty=1
 *  - trigger qty ≥ threshold AND bonus qty>1 → ADJUST do qty=1
 *  - trigger qty ≥ threshold AND brak coupon  → APPLY MOODLES_GIFT (100% off ebook)
 *  - trigger qty < threshold AND ma coupon    → REMOVE MOODLES_GIFT
 *
 * Idempotentne. Best-effort — jeśli mutacja się wywali, zwraca order bez zmian
 * zamiast crashować cały endpoint.
 */
export async function reconcileBonus(
  order: any,
  activeToken: string | undefined,
): Promise<{ order: any; activeToken: string | undefined }> {
  if (!order || order.__typename === "ErrorResult" || !activeToken) {
    return { order, activeToken };
  }
  // Order może mieć __typename === 'Order' albo być raw obiektem z GET_ACTIVE_ORDER.
  // Obsługujemy oba.
  if (order.__typename && order.__typename !== "Order")
    return { order, activeToken };

  const triggerQty = getTriggerTotalQty(order);
  const bonusLines = findAllBonusLines(order);
  const couponApplied = hasBonusCoupon(order);
  const shouldHaveBonus = triggerQty >= TRIGGER_THRESHOLD;

  // Stan już poprawny — exit fast (BOTH bonus line AND coupon).
  if (
    shouldHaveBonus &&
    bonusLines.length === 1 &&
    bonusLines[0].quantity === 1 &&
    couponApplied
  ) {
    return { order, activeToken };
  }
  if (!shouldHaveBonus && bonusLines.length === 0 && !couponApplied) {
    return { order, activeToken };
  }

  let currentToken = activeToken;
  let mutated = false;

  // CASE A: dodaj bonusa (próg osiągnięty, brak linii)
  if (shouldHaveBonus && bonusLines.length === 0) {
    const bonusVariantId = await resolveBonusVariantId(currentToken);
    if (bonusVariantId) {
      try {
        const resp = await vendureQuery<any>(
          ADD_BONUS_MUTATION,
          { variantId: bonusVariantId, quantity: 1 },
          currentToken,
        );
        const r = resp.data?.addItemToOrder;
        if (
          r?.__typename === "Order" &&
          getTriggerTotalQty(r) >= TRIGGER_THRESHOLD
        ) {
          currentToken = resp.newToken || currentToken;
          mutated = true;
        }
      } catch {
        /* ignore */
      }
    }
  }

  // CASE B: usuń bonusy (próg spadł)
  if (!shouldHaveBonus && bonusLines.length > 0) {
    for (const bl of bonusLines) {
      try {
        const resp = await vendureQuery<any>(
          REMOVE_LINE,
          { lineId: bl.id },
          currentToken,
        );
        if (resp.data?.removeOrderLine?.__typename === "Order") {
          currentToken = resp.newToken || currentToken;
          mutated = true;
        }
      } catch {
        /* ignore */
      }
    }
  }

  // CASE C: dedup wielokrotnych bonusów (zachowaj 1)
  if (shouldHaveBonus && bonusLines.length > 1) {
    for (let i = 1; i < bonusLines.length; i++) {
      try {
        const resp = await vendureQuery<any>(
          REMOVE_LINE,
          { lineId: bonusLines[i].id },
          currentToken,
        );
        if (resp.data?.removeOrderLine?.__typename === "Order") {
          currentToken = resp.newToken || currentToken;
          mutated = true;
        }
      } catch {
        /* ignore */
      }
    }
  }

  // CASE D: jedyny bonus z qty > 1 (user lub bug zwiększył qty)
  if (shouldHaveBonus && bonusLines.length >= 1 && bonusLines[0].quantity > 1) {
    try {
      const resp = await vendureQuery<any>(
        ADJUST_LINE,
        { lineId: bonusLines[0].id, quantity: 1 },
        currentToken,
      );
      if (resp.data?.adjustOrderLine?.__typename === "Order") {
        currentToken = resp.newToken || currentToken;
        mutated = true;
      }
    } catch {
      /* ignore */
    }
  }

  // CASE E: apply MOODLES_GIFT coupon (próg osiągnięty, brak couponu).
  // To jest CO ROBI cenę 0 zł — coupon ma 100% discount na Miniprzewodnik.
  // Bez Vendure promotion z tym couponem nasz kod milcząco nie obniży ceny.
  if (shouldHaveBonus && !couponApplied) {
    try {
      const resp = await vendureQuery<any>(
        APPLY_COUPON_MUTATION,
        { couponCode: BONUS_COUPON_CODE },
        currentToken,
      );
      const r = resp.data?.applyCouponCode;
      if (r?.__typename === "Order") {
        currentToken = resp.newToken || currentToken;
        mutated = true;
      }
      // CouponCodeInvalidError = promotion nie istnieje w Vendure → silent fail.
      // User dostanie info przez 0 errors UI ale full price; trzeba dodać promo w admin.
    } catch {
      /* ignore */
    }
  }

  // CASE F: remove MOODLES_GIFT coupon (próg spadł, coupon był).
  if (!shouldHaveBonus && couponApplied) {
    try {
      const resp = await vendureQuery<any>(
        REMOVE_COUPON_MUTATION,
        { couponCode: BONUS_COUPON_CODE },
        currentToken,
      );
      if (resp.data?.removeCouponCode?.__typename === "Order") {
        currentToken = resp.newToken || currentToken;
        mutated = true;
      }
    } catch {
      /* ignore */
    }
  }

  // Jeśli była mutacja — pobierz świeży order (z totalami po promocjach).
  if (mutated) {
    try {
      const refresh = await vendureQuery<any>(
        GET_ACTIVE_ORDER,
        {},
        currentToken,
      );
      const fresh = refresh.data?.activeOrder;
      if (fresh) {
        currentToken = refresh.newToken || currentToken;

        // SAFETY NET (bug 2026-05-26): bonus line w koszyku BEZ couponu
        // MOODLES_GIFT = coupon nie aplikował się (np. perCustomerUsageLimit
        // exceeded, promotion disabled / expired w Vendure admin). Storefront
        // pokazuje "Gratis" ale PayU dostaje pełny total → user płaci za
        // "gratis". Rollback: usuń bonus line, lepiej brak ebooka niż unpaid.
        const bonusInFresh = findAllBonusLines(fresh);
        const couponInFresh = hasBonusCoupon(fresh);
        if (bonusInFresh.length > 0 && !couponInFresh) {
          for (const bl of bonusInFresh) {
            try {
              const cleanup = await vendureQuery<any>(
                REMOVE_LINE,
                { lineId: bl.id },
                currentToken,
              );
              if (cleanup.data?.removeOrderLine?.__typename === "Order") {
                currentToken = cleanup.newToken || currentToken;
              }
            } catch {
              /* ignore */
            }
          }
          try {
            const refresh2 = await vendureQuery<any>(
              GET_ACTIVE_ORDER,
              {},
              currentToken,
            );
            const fresh2 = refresh2.data?.activeOrder;
            if (fresh2)
              return {
                order: fresh2,
                activeToken: refresh2.newToken || currentToken,
              };
          } catch {
            /* ignore */
          }
        }

        return { order: fresh, activeToken: currentToken };
      }
    } catch {
      /* ignore */
    }
  }

  return { order, activeToken: currentToken };
}

/**
 * Sync free-shipping coupon. Wywoływane PO reconcileBonus żeby widzieć finalny
 * subTotalWithTax (po discount na ebook).
 *
 * Logika:
 *  - subTotalWithTax ≥ 9900 AND brak coupon → APPLY FREE_SHIP_99
 *  - subTotalWithTax < 9900 AND ma coupon  → REMOVE FREE_SHIP_99
 *
 * Wymaga Vendure promotion z code FREE_SHIP_99 + action "Free shipping".
 * Gdy promo nie istnieje — apply silent fail, user widzi shipping cost.
 */
export async function reconcileFreeShipping(
  order: any,
  activeToken: string | undefined,
): Promise<{ order: any; activeToken: string | undefined }> {
  if (!order || order.__typename === "ErrorResult" || !activeToken) {
    return { order, activeToken };
  }
  if (order.__typename && order.__typename !== "Order")
    return { order, activeToken };

  const subtotal = Number(order.subTotalWithTax) || 0;
  const shouldHaveCoupon = subtotal >= FREE_SHIPPING_THRESHOLD_GROSZE;
  const hasCoupon =
    Array.isArray(order.couponCodes) &&
    order.couponCodes.includes(FREE_SHIPPING_COUPON_CODE);

  // Stan już poprawny.
  if (shouldHaveCoupon === hasCoupon) {
    return { order, activeToken };
  }

  let currentToken = activeToken;
  let mutated = false;

  if (shouldHaveCoupon && !hasCoupon) {
    try {
      const resp = await vendureQuery<any>(
        APPLY_COUPON_MUTATION,
        { couponCode: FREE_SHIPPING_COUPON_CODE },
        currentToken,
      );
      if (resp.data?.applyCouponCode?.__typename === "Order") {
        currentToken = resp.newToken || currentToken;
        mutated = true;
      }
    } catch {
      /* ignore */
    }
  } else if (!shouldHaveCoupon && hasCoupon) {
    try {
      const resp = await vendureQuery<any>(
        REMOVE_COUPON_MUTATION,
        { couponCode: FREE_SHIPPING_COUPON_CODE },
        currentToken,
      );
      if (resp.data?.removeCouponCode?.__typename === "Order") {
        currentToken = resp.newToken || currentToken;
        mutated = true;
      }
    } catch {
      /* ignore */
    }
  }

  if (mutated) {
    try {
      const refresh = await vendureQuery<any>(
        GET_ACTIVE_ORDER,
        {},
        currentToken,
      );
      const fresh = refresh.data?.activeOrder;
      if (fresh)
        return { order: fresh, activeToken: refresh.newToken || currentToken };
    } catch {
      /* ignore */
    }
  }

  return { order, activeToken: currentToken };
}

/**
 * Synchronizuje auto-bonus ebook (MOODLES_GIFT) + free shipping (FREE_SHIP_99).
 * Jeden helper żeby endpointy nie musiały pamiętać o kolejności.
 * Kolejność: reconcileBonus (ebook) zmienia subTotalWithTax przez discount,
 * dopiero potem reconcileFreeShipping (czyta finalny subtotal).
 */
export async function reconcileCart(
  order: any,
  activeToken: string | undefined,
): Promise<{ order: any; activeToken: string | undefined }> {
  const step1 = await reconcileBonus(order, activeToken);
  const step2 = await reconcileFreeShipping(step1.order, step1.activeToken);
  return step2;
}

// Linia-gift chroniona przed ręczną modyfikacją (X / qty): ebook.
const PROTECTED_GIFT_SLUGS = [BONUS_PRODUCT_SLUG];
function isProtectedGiftLine(line: any): boolean {
  return PROTECTED_GIFT_SLUGS.includes(line?.productVariant?.product?.slug);
}

/**
 * Czy line ID przekazane przez frontend wskazuje na linię-gift (ebook)?
 * Używane w /adjust i /remove żeby zablokować ręczną modyfikację gratisu —
 * znikają tylko gdy trigger qty Moodles spadnie poniżej progu (reconcile).
 */
export async function isBonusLineId(
  lineId: string,
  token: string | undefined,
): Promise<boolean> {
  try {
    const { data } = await vendureQuery<any>(GET_ACTIVE_ORDER, {}, token);
    const order = data?.activeOrder;
    if (!order?.lines) return false;
    const line = order.lines.find((l: any) => String(l.id) === String(lineId));
    return line ? isProtectedGiftLine(line) : false;
  } catch {
    return false;
  }
}

/**
 * Backward-compat — niektóre endpointy nadal importują tę nazwę.
 * Teraz to po prostu wrapper na reconcileBonus.
 */
export async function syncBonusEbookOnRemove(
  order: any,
  activeToken: string | undefined,
): Promise<{ order: any; activeToken: string | undefined }> {
  return reconcileBonus(order, activeToken);
}
