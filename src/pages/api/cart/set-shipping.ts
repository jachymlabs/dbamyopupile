import type { APIRoute } from 'astro';
import {
  getToken,
  vendureQuery,
  buildResponse,
  ORDER_FRAGMENT,
} from '@/lib/vendure-api';
import { withCartGuards, parseCartBody } from '@/lib/cart-helpers';

const SET_SHIPPING = `mutation SetShipping($shippingMethodId: [ID!]!) {
  setOrderShippingMethod(shippingMethodId: $shippingMethodId) {
    __typename
    ... on Order { ${ORDER_FRAGMENT} }
    ... on ErrorResult { errorCode message }
  }
}`;

const TRANSITION_TO_ADDING_ITEMS = `mutation { transitionOrderToState(state: "AddingItems") { __typename ... on Order { id state } ... on OrderStateTransitionError { errorCode message } } }`;

export const POST: APIRoute = withCartGuards(
  { rateLimitKey: 'cart-set-shipping' },
  async ({ request }) => {
    const token = getToken(request);
    const parsed = await parseCartBody<{ shippingMethodId?: unknown }>(request);
    if ('error' in parsed) return parsed.error;
    const { shippingMethodId } = parsed.data;

    if (!shippingMethodId || typeof shippingMethodId !== 'string') {
      return buildResponse({ order: null, error: 'Invalid shippingMethodId' });
    }
    if (shippingMethodId.length > 50) {
      return buildResponse({ order: null, error: 'Invalid shippingMethodId' });
    }

    let { data, newToken } = await vendureQuery(
      SET_SHIPPING,
      { shippingMethodId: [shippingMethodId] },
      token,
    );

    let result = data?.setOrderShippingMethod;
    let activeToken = newToken || token;

    // Order utknal w stanie != AddingItems → wymus reset i retry
    if (result?.__typename === 'OrderModificationError') {
      const reset = await vendureQuery(TRANSITION_TO_ADDING_ITEMS, {}, activeToken);
      activeToken = reset.newToken || activeToken;
      if (reset.data?.transitionOrderToState?.__typename === 'Order') {
        const retry = await vendureQuery(SET_SHIPPING, { shippingMethodId: [shippingMethodId] }, activeToken);
        activeToken = retry.newToken || activeToken;
        result = retry.data?.setOrderShippingMethod;
      } else {
        // CRITICAL-5: log silent failure — reset transition sie nie udal,
        // user blokowany w stanie payment, nie wiemy czemu bez logu.
        console.error('[set-shipping] Order reset to AddingItems failed:', reset.data?.transitionOrderToState);
      }
    }

    if (result?.__typename === 'Order') {
      return buildResponse({ order: result }, activeToken);
    }

    // HIGH-4: walidacja eligibility — jesli wybrana metoda nie jest dostepna
    // (np. po zmianie qty free-shipping promo zmienil eligibility), zwroc czytelny komunikat.
    if (result?.__typename === 'IneligibleShippingMethodError') {
      return buildResponse({ order: null, error: 'Wybrana metoda dostawy jest niedostepna.' }, activeToken);
    }

    // MEDIUM-2: jesli po reset+retry wciaz fail, zwroc actionable error message
    // (zamiast cichego null albo niezrozumialego Vendure errorCode).
    return buildResponse(
      { order: null, error: result?.message || 'Nie udalo sie zmienic metody dostawy. Odswiez strone.' },
      activeToken,
    );
  },
);
