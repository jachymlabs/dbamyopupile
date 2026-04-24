import type { APIRoute } from 'astro';
import {
  getToken,
  vendureQuery,
  buildResponse,
  ORDER_FRAGMENT,
} from '@/lib/vendure-api';
import { isRateLimitedAsync } from '@/lib/rate-limit';
import { assertSameOrigin } from '@/lib/security';

const ADJUST = `mutation Adjust($lineId: ID!, $quantity: Int!) {
  adjustOrderLine(orderLineId: $lineId, quantity: $quantity) {
    __typename
    ... on Order { ${ORDER_FRAGMENT} }
    ... on ErrorResult { errorCode message }
  }
}`;

const TRANSITION_TO_ADDING_ITEMS = `mutation { transitionOrderToState(state: "AddingItems") { __typename ... on Order { id state } ... on OrderStateTransitionError { errorCode message } } }`;

export const POST: APIRoute = async ({ request }) => {
  // CSRF: secondary defense (primary is SameSite=Lax cookie).
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (await isRateLimitedAsync(ip, 'cart-adjust', 30, 60_000)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
  }

  const token = getToken(request);
  let body: any;
  try {
    body = await request.json();
  } catch {
    return buildResponse({ order: null, error: 'Invalid request body' });
  }
  const { lineId, quantity } = body;

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
};
