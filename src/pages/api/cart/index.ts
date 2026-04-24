import type { APIRoute } from 'astro';
import {
  getToken,
  vendureQuery,
  buildResponse,
  ORDER_FRAGMENT,
} from '@/lib/vendure-api';
import { isRateLimitedAsync } from '@/lib/rate-limit';
import { assertSameOrigin } from '@/lib/security';
import { sendCAPIEvent, buildUserData, generateEventId } from '@/lib/meta-capi';
import { getStoreConfig } from '@/lib/store-config';
import { TRIGGER_VARIANT_ID, BONUS_VARIANT_ID } from '@/lib/cart-helpers';

const GET_ACTIVE_ORDER = `query { activeOrder { ${ORDER_FRAGMENT} } }`;

const ADD_TO_CART = `mutation AddToCart($variantId: ID!, $quantity: Int!) {
  addItemToOrder(productVariantId: $variantId, quantity: $quantity) {
    __typename
    ... on Order { ${ORDER_FRAGMENT} }
    ... on ErrorResult { errorCode message }
  }
}`;

const TRANSITION_TO_ADDING_ITEMS = `mutation { transitionOrderToState(state: "AddingItems") { __typename ... on Order { id state } ... on OrderStateTransitionError { errorCode message } } }`;

// Variant ID stałe (TRIGGER_VARIANT_ID = WolnaMiska, BONUS_VARIANT_ID = Ebook)
// importowane z @/lib/cart-helpers — single source of truth (były duplikowane
// w index.ts + remove.ts przed Sprint 3 refactor).

const REMOVE_LINE = `mutation RemoveLine($lineId: ID!) {
  removeOrderLine(orderLineId: $lineId) { __typename ... on Order { id } }
}`;
const ADJUST_LINE = `mutation AdjustLine($lineId: ID!, $quantity: Int!) {
  adjustOrderLine(orderLineId: $lineId, quantity: $quantity) {
    __typename ... on Order { id }
  }
}`;

// H1 (Sprint 2): per-token in-flight lock to serialize concurrent POST /api/cart
// for the SAME session. Two rapid double-clicks (race window ~1ms) used to both
// see `!hasBonus` and both add an ebook line — resulting in two free ebooks.
//
// Limitation: this Map is PER-INSTANCE on Vercel (serverless). Cross-instance
// races are still theoretically possible but very unlikely in practice (Vercel
// tends to route same-session requests through the same warm lambda).
// Belt-and-suspenders: after adding the bonus we also DEDUPLICATE bonus lines
// in the resulting order — that check is idempotent and corrects any stragglers
// regardless of where they were created.
const inFlightByToken = new Map<string, Promise<void>>();

async function withTokenLock<T>(token: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!token) return fn();
  const prev = inFlightByToken.get(token);
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  inFlightByToken.set(token, prev ? prev.then(() => next) : next);
  try {
    if (prev) { try { await prev; } catch { /* ignore upstream */ } }
    return await fn();
  } finally {
    release();
    // Cleanup if we're still the head of the chain
    if (inFlightByToken.get(token) === next) inFlightByToken.delete(token);
  }
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const token = getToken(request);
    const { data, newToken } = await vendureQuery(GET_ACTIVE_ORDER, {}, token);
    return buildResponse({ order: data?.activeOrder || null }, newToken);
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  // CSRF: secondary defense (primary is SameSite=Lax cookie).
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (await isRateLimitedAsync(ip, 'cart-add', 30, 60_000)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
  }
  const token = getToken(request);
  let body: any;
  try {
    body = await request.json();
  } catch {
    return buildResponse({ order: null, error: 'Invalid request body' });
  }
  const { variantId, quantity = 1 } = body;

  // H5: Input validation
  if (!variantId || typeof variantId !== 'string') {
    return buildResponse({ order: null, error: 'Invalid variantId' });
  }
  if (variantId.length > 50) {
    return buildResponse({ order: null, error: 'Invalid variantId' });
  }
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
    return buildResponse({ order: null, error: 'Quantity must be between 1 and 99' });
  }

  // H1 (Sprint 2): serialize concurrent adds for the SAME session token to prevent
  // double-add races (e.g. user double-clicks "Dodaj do koszyka").
  return withTokenLock(token, () => addToCartHandler({ token, variantId, qty, request }));
};

async function addToCartHandler({
  token,
  variantId,
  qty,
  request,
}: {
  token: string | undefined;
  variantId: string;
  qty: number;
  request: Request;
}): Promise<Response> {
  try {
    let { data, newToken } = await vendureQuery(
      ADD_TO_CART,
      { variantId, quantity: qty },
      token,
    );

    let result = data?.addItemToOrder;
    // Krytyczne: jeśli Vendure nie rotował sesji, newToken będzie undefined.
    // Zachowujemy oryginalny token jako fallback — inaczej drugi call
    // trafia do NOWEJ anonimowej sesji i koszyk zawiera tylko bonus item.
    let activeToken = newToken || token;

    // Order utknal w stanie != AddingItems (np. po nieudanym checkout) — wymus reset i retry
    if (result?.__typename === 'OrderModificationError') {
      const reset = await vendureQuery(TRANSITION_TO_ADDING_ITEMS, {}, activeToken);
      activeToken = reset.newToken || activeToken;
      if (reset.data?.transitionOrderToState?.__typename === 'Order') {
        const retry = await vendureQuery(ADD_TO_CART, { variantId, quantity: qty }, activeToken);
        activeToken = retry.newToken || activeToken;
        result = retry.data?.addItemToOrder;
      }
    }

    // Auto-add Ebook gdy w koszyku jest WolnaMiska i ebooka jeszcze nie ma
    if (result?.__typename === 'Order') {
      const hasTrigger = result.lines?.some((l: any) => l.productVariant?.id === TRIGGER_VARIANT_ID);
      const hasBonus = result.lines?.some((l: any) => l.productVariant?.id === BONUS_VARIANT_ID);
      if (hasTrigger && !hasBonus && activeToken) {
        try {
          const bonusResp = await vendureQuery(
            ADD_TO_CART,
            { variantId: BONUS_VARIANT_ID, quantity: 1 },
            activeToken,
          );
          const bonusResult = bonusResp.data?.addItemToOrder;
          // Walidacja: drugi call MUSI zawierać trigger variant w lines
          // (bo używamy tej samej sesji). Jeśli nie — coś poszło źle,
          // używamy result z pierwszej mutacji i nie nadpisujemy.
          if (bonusResult?.__typename === 'Order' &&
              bonusResult.lines?.some((l: any) => l.productVariant?.id === TRIGGER_VARIANT_ID)) {
            result = bonusResult;
            activeToken = bonusResp.newToken || activeToken;
          }
        } catch { /* if bonus fails, keep original order */ }
      }

      // H1 (Sprint 2) — IDEMPOTENT POST-CHECK: even with the per-token lock above,
      // a cross-instance race could theoretically end with >1 bonus line OR a bonus
      // line with quantity > 1. Normalize to exactly ONE bonus line of qty 1 whenever
      // a trigger is present. Cheap (only fires when trigger present), self-healing.
      if (hasTrigger) {
        const bonusLines = (result.lines ?? []).filter(
          (l: any) => l.productVariant?.id === BONUS_VARIANT_ID,
        );
        if (bonusLines.length > 1) {
          // Keep first, remove the rest.
          for (let i = 1; i < bonusLines.length; i++) {
            try {
              const r = await vendureQuery(REMOVE_LINE, { lineId: bonusLines[i].id }, activeToken);
              activeToken = r.newToken || activeToken;
              if (r.data?.removeOrderLine?.__typename === 'Order') {
                // Refresh result to mirror the new state
                result = (await vendureQuery(GET_ACTIVE_ORDER, {}, activeToken)).data?.activeOrder ?? result;
              }
            } catch { /* best-effort cleanup */ }
          }
        } else if (bonusLines.length === 1 && bonusLines[0].quantity > 1) {
          try {
            const r = await vendureQuery(
              ADJUST_LINE,
              { lineId: bonusLines[0].id, quantity: 1 },
              activeToken,
            );
            activeToken = r.newToken || activeToken;
            if (r.data?.adjustOrderLine?.__typename === 'Order') {
              result = (await vendureQuery(GET_ACTIVE_ORDER, {}, activeToken)).data?.activeOrder ?? result;
            }
          } catch { /* best-effort */ }
        }
      }
    }

    // Ochrona: jeśli user próbuje dodać ebook bezpośrednio bez WolnaMiski,
    // odmów. Ebook jest dostępny tylko jako bonus do miski.
    if (variantId === BONUS_VARIANT_ID && result?.__typename === 'Order') {
      const hasTrigger = result.lines?.some((l: any) => l.productVariant?.id === TRIGGER_VARIANT_ID);
      if (!hasTrigger) {
        return buildResponse({ order: null, error: 'Ebook dostępny tylko z WolnaMiską' }, activeToken);
      }
    }

    if (result?.__typename === 'Order') {
      // CAPI: AddToCart — consent-gated
      const cookies = request.headers.get('cookie') || '';
      if (cookies.includes('cookie_consent=accepted')) {
        const storeConfig = await getStoreConfig(request);
        const addedLine = result.lines?.find((l: any) => l.productVariant?.id === variantId);
        const userData = await buildUserData(request);
        sendCAPIEvent({
          event_name: 'AddToCart',
          event_time: Math.floor(Date.now() / 1000),
          event_id: generateEventId(),
          event_source_url: request.headers.get('referer') || '',
          action_source: 'website',
          user_data: userData,
          custom_data: {
            content_ids: [addedLine?.productVariant?.sku || variantId],
            content_type: 'product',
            value: addedLine ? addedLine.unitPriceWithTax / 100 : 0,
            currency: 'PLN',
          },
        }, storeConfig.metaDatasetId);
      }
      return buildResponse({ order: result }, activeToken);
    }
    return buildResponse({ order: null, error: result?.message }, activeToken);
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
