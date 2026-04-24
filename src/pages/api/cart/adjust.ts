import type { APIRoute } from 'astro';
import {
  getToken,
  vendureQuery,
  buildResponse,
  ORDER_FRAGMENT,
} from '@/lib/vendure-api';
import { withCartGuards, parseCartBody } from '@/lib/cart-helpers';

const ADJUST = `mutation Adjust($lineId: ID!, $quantity: Int!) {
  adjustOrderLine(orderLineId: $lineId, quantity: $quantity) {
    __typename
    ... on Order { ${ORDER_FRAGMENT} }
    ... on ErrorResult { errorCode message }
  }
}`;

const TRANSITION_TO_ADDING_ITEMS = `mutation { transitionOrderToState(state: "AddingItems") { __typename ... on Order { id state } ... on OrderStateTransitionError { errorCode message } } }`;

export const POST: APIRoute = withCartGuards(
  { rateLimitKey: 'cart-adjust' },
  async ({ request }) => {
    const token = getToken(request);
    const parsed = await parseCartBody<{ lineId?: unknown; quantity?: unknown }>(request);
    if ('error' in parsed) return parsed.error;
    const { lineId, quantity } = parsed.data;

    // H5: Input validation
    if (!lineId || typeof lineId !== 'string') {
      return buildResponse({ order: null, error: 'Invalid lineId' });
    }
    if (lineId.length > 50) {
      return buildResponse({ order: null, error: 'Invalid lineId' });
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      return buildResponse({ order: null, error: 'Quantity must be between 1 and 99' });
    }

    let { data, newToken } = await vendureQuery(
      ADJUST,
      { lineId, quantity: qty },
      token,
    );

    let result = data?.adjustOrderLine;
    let activeToken = newToken || token;

    // Order utknal w stanie != AddingItems (np. po nieudanym checkout) — wymus reset i retry
    if (result?.__typename === 'OrderModificationError') {
      const reset = await vendureQuery(TRANSITION_TO_ADDING_ITEMS, {}, activeToken);
      activeToken = reset.newToken || activeToken;
      if (reset.data?.transitionOrderToState?.__typename === 'Order') {
        const retry = await vendureQuery(ADJUST, { lineId, quantity: qty }, activeToken);
        activeToken = retry.newToken || activeToken;
        result = retry.data?.adjustOrderLine;
      }
    }

    if (result?.__typename === 'Order') {
      return buildResponse({ order: result }, activeToken);
    }
    return buildResponse({ order: null, error: result?.message }, activeToken);
  },
);
