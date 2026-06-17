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
import { reconcileCart, BONUS_PRODUCT_SLUG } from '@/lib/cart-helpers';

const GET_ACTIVE_ORDER = `query { activeOrder { ${ORDER_FRAGMENT} } }`;

const ADD_TO_CART = `mutation AddToCart($variantId: ID!, $quantity: Int!) {
  addItemToOrder(productVariantId: $variantId, quantity: $quantity) {
    __typename
    ... on Order { ${ORDER_FRAGMENT} }
    ... on ErrorResult { errorCode message }
  }
}`;

const TRANSITION_TO_ADDING_ITEMS = `mutation { transitionOrderToState(state: "AddingItems") { __typename ... on Order { id state } ... on OrderStateTransitionError { errorCode message } } }`;

// H1 (Sprint 2): per-token in-flight lock to serialize concurrent POST /api/cart
// for the SAME session. Two rapid double-clicks (race window ~1ms) used to both
// add bonus line — resulting in duplicate ebooków. reconcileBonus jest dodatkowo
// idempotentny (dedup) jako belt-and-suspenders.
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
    // Reconcile na GET też — jeśli klient wszedł na sesję której bonus/coupon state
    // jest niespójny (np. server restart między operacjami), naprawiamy.
    const synced = await reconcileCart(data?.activeOrder, newToken || token);
    return buildResponse({ order: synced.order || null }, synced.activeToken);
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
  const { variantId, quantity = 1, eventId } = body;

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
  const safeEventId =
    typeof eventId === 'string' &&
    eventId.length <= 50 &&
    /^[A-Za-z0-9-]+$/.test(eventId)
      ? eventId
      : undefined;

  return withTokenLock(token, () => addToCartHandler({ token, variantId, qty, request, eventId: safeEventId }));
};

async function addToCartHandler({
  token,
  variantId,
  qty,
  request,
  eventId,
}: {
  token: string | undefined;
  variantId: string;
  qty: number;
  request: Request;
  eventId?: string;
}): Promise<Response> {
  try {
    // Ochrona: ebook gratis nie może być dodany bezpośrednio przez user'a.
    // Jest dodawany tylko przez reconcileBonus (auto-add przy 2+ Moodles).
    // Walidacja przez slug — pobieramy variant info żeby sprawdzić.
    // Ten check robimy PRZED dodaniem żeby uniknąć dodania-i-cofnięcia.

    let { data, newToken } = await vendureQuery(
      ADD_TO_CART,
      { variantId, quantity: qty },
      token,
    );

    let result = data?.addItemToOrder;
    // Krytyczne: jeśli Vendure nie rotował sesji, newToken będzie undefined.
    // Zachowujemy oryginalny token jako fallback.
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

    // Po pomyślnym add — uruchom reconcileCart żeby dopasować bonus + free-shipping
    // (dodanie 2-go zestawu Moodles → auto-add ebook + MOODLES_GIFT; subtotal ≥ 99 →
    // FREE_SHIP_99).
    if (result?.__typename === 'Order') {
      const synced = await reconcileCart(result, activeToken);
      result = synced.order || result;
      activeToken = synced.activeToken || activeToken;

      // Ochrona: jeśli user próbował dodać bonus product bezpośrednio i mimo to
      // został on dodany (race) — reconcileBonus mogło zostawić go (jeśli trigger
      // qty >= threshold). To OK. Jeśli reconcile usunął — też OK. Brak akcji.

      // CAPI: AddToCart
      const storeConfig = await getStoreConfig(request);
      const addedLine = result?.lines?.find((l: any) => l.productVariant?.id === variantId);
      // Nie loguj CAPI dla bonus product — to nie jest user-initiated kupno.
      const isBonusAdd = addedLine?.productVariant?.product?.slug === BONUS_PRODUCT_SLUG;
      if (!isBonusAdd) {
        const userData = await buildUserData(request);
        await sendCAPIEvent({
          event_name: 'AddToCart',
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId || generateEventId(),
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
