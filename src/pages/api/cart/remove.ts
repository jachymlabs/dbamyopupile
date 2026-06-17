import type { APIRoute } from 'astro';
import {
  getToken,
  vendureQuery,
  buildResponse,
  ORDER_FRAGMENT,
} from '@/lib/vendure-api';
import { withCartGuards, parseCartBody, reconcileCart, isBonusLineId } from '@/lib/cart-helpers';

const REMOVE = `mutation Remove($lineId: ID!) {
  removeOrderLine(orderLineId: $lineId) {
    __typename
    ... on Order { ${ORDER_FRAGMENT} }
    ... on ErrorResult { errorCode message }
  }
}`;

const TRANSITION_TO_ADDING_ITEMS = `mutation { transitionOrderToState(state: "AddingItems") { __typename ... on Order { id state } ... on OrderStateTransitionError { errorCode message } } }`;

// Autorytatywny bieżący order — używany jako fallback gdy po remove + reconcile
// (kaskadowe usunięcie giftów) wynik nie jest typu Order. Pusty order zwraca
// lines:[] (NIE null), więc drawer dostaje spójny stan zamiast null.
const GET_ACTIVE_ORDER_Q = `query { activeOrder { ${ORDER_FRAGMENT} } }`;

export const POST: APIRoute = withCartGuards(
  { rateLimitKey: 'cart-remove' },
  async ({ request }) => {
    const token = getToken(request);
    const parsed = await parseCartBody<{ lineId?: unknown }>(request);
    if ('error' in parsed) return parsed.error;
    const { lineId } = parsed.data;

    // H5: Input validation
    if (!lineId || typeof lineId !== 'string') {
      return buildResponse({ order: null, error: 'Invalid lineId' });
    }
    if (lineId.length > 50) {
      return buildResponse({ order: null, error: 'Invalid lineId' });
    }

    // Blok: ebook gratis nie może być usunięty manualnie. Znika tylko
    // wtedy, gdy trigger qty spadnie < 2 (reconcileBonus załatwia).
    if (await isBonusLineId(lineId, token)) {
      return buildResponse({ order: null, error: 'Ebook gratis nie może być usunięty' });
    }

    let { data, newToken } = await vendureQuery(REMOVE, { lineId }, token);

    let result = data?.removeOrderLine;
    let activeToken = newToken || token;

    // Order utknal w stanie != AddingItems (np. po nieudanym checkout) — wymus reset i retry
    if (result?.__typename === 'OrderModificationError') {
      const reset = await vendureQuery(TRANSITION_TO_ADDING_ITEMS, {}, activeToken);
      activeToken = reset.newToken || activeToken;
      if (reset.data?.transitionOrderToState?.__typename === 'Order') {
        const retry = await vendureQuery(REMOVE, { lineId }, activeToken);
        activeToken = retry.newToken || activeToken;
        result = retry.data?.removeOrderLine;
      }
    }

    // Reconcile po remove — np. user usunął jedną z linii Moodles, suma wariantów
    // spadła < 2 (ebook wyleci) lub subtotal spadł poniżej progu (free shipping wyleci).
    const synced = await reconcileCart(result, activeToken);
    result = synced.order || result;
    activeToken = synced.activeToken;

    if (result?.__typename === 'Order') {
      return buildResponse({ order: result }, activeToken);
    }

    // Result nie jest Order — najczęściej koszyk opróżnił się kaskadowo (usunięcie
    // Moodles → reconcile usuwa ebook + brelok + coupony → activeOrder w trakcie
    // reconcile bywa null). Pobierz autorytatywny stan żeby zwrócić poprawny pusty
    // order (lines:[]) zamiast null — inaczej drawer pustoszał i wymagał refresha.
    try {
      const fresh = await vendureQuery(GET_ACTIVE_ORDER_Q, {}, activeToken);
      activeToken = fresh.newToken || activeToken;
      const freshOrder = (fresh.data as any)?.activeOrder ?? null;
      return buildResponse({ order: freshOrder }, activeToken);
    } catch {
      return buildResponse({ order: null, error: result?.message }, activeToken);
    }
  },
);
