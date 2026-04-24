import type { APIRoute } from 'astro';
import {
  getToken,
  vendureQuery,
  buildResponse,
  ORDER_FRAGMENT,
} from '@/lib/vendure-api';
import { isRateLimited } from '@/lib/rate-limit';

const REMOVE = `mutation Remove($lineId: ID!) {
  removeOrderLine(orderLineId: $lineId) {
    __typename
    ... on Order { ${ORDER_FRAGMENT} }
    ... on ErrorResult { errorCode message }
  }
}`;

const TRANSITION_TO_ADDING_ITEMS = `mutation { transitionOrderToState(state: "AddingItems") { __typename ... on Order { id state } ... on OrderStateTransitionError { errorCode message } } }`;

// Auto-bonus: usuwamy ebooka jeśli WolnaMiska zniknęła z koszyka
const TRIGGER_VARIANT_ID = '21'; // WolnaMiska
const BONUS_VARIANT_ID = '23';   // Ebook gratis

export const POST: APIRoute = async ({ request }) => {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (isRateLimited(ip, 'cart-remove', 30, 60_000)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
  }

  const token = getToken(request);
  let body: any;
  try {
    body = await request.json();
  } catch {
    return buildResponse({ order: null, error: 'Invalid request body' });
  }
  const { lineId } = body;

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
  if (result?.__typename === 'Order') {
    const hasTrigger = result.lines?.some((l: any) => l.productVariant?.id === TRIGGER_VARIANT_ID);
    const bonusLine = result.lines?.find((l: any) => l.productVariant?.id === BONUS_VARIANT_ID);
    if (!hasTrigger && bonusLine && activeToken) {
      try {
        const bonusResp = await vendureQuery(REMOVE, { lineId: bonusLine.id }, activeToken);
        const bonusResult = bonusResp.data?.removeOrderLine;
        if (bonusResult?.__typename === 'Order') {
          result = bonusResult;
          activeToken = bonusResp.newToken || activeToken;
        }
      } catch { /* ignore */ }
    }
  }

  if (result?.__typename === 'Order') {
    return buildResponse({ order: result }, activeToken);
  }
  return buildResponse({ order: null, error: result?.message }, activeToken);
};
