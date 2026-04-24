import type { APIRoute } from 'astro';
import {
  getToken,
  vendureQuery,
  buildResponse,
  ORDER_FRAGMENT,
} from '@/lib/vendure-api';
import { withCartGuards, parseCartBody, syncBonusEbookOnRemove } from '@/lib/cart-helpers';

const REMOVE = `mutation Remove($lineId: ID!) {
  removeOrderLine(orderLineId: $lineId) {
    __typename
    ... on Order { ${ORDER_FRAGMENT} }
    ... on ErrorResult { errorCode message }
  }
}`;

const TRANSITION_TO_ADDING_ITEMS = `mutation { transitionOrderToState(state: "AddingItems") { __typename ... on Order { id state } ... on OrderStateTransitionError { errorCode message } } }`;

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

    let { data, newToken } = await vendureQuery(REMOVE, { lineId }, token);

    let result = data?.removeOrderLine;
    // Zachowaj oryginalny token jako fallback, żeby drugi call nie trafił
    // do nowej sesji (ebook usuwany z innego koszyka)
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

    // Auto-remove ebook gdy WolnaMiska zniknęła
    const synced = await syncBonusEbookOnRemove(result, activeToken);
    result = synced.order;
    activeToken = synced.activeToken;

    if (result?.__typename === 'Order') {
      return buildResponse({ order: result }, activeToken);
    }
    return buildResponse({ order: null, error: result?.message }, activeToken);
  },
);
