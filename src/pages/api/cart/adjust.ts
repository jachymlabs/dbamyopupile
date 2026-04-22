import type { APIRoute } from 'astro';
import {
  getToken,
  vendureQuery,
  buildResponse,
  ORDER_FRAGMENT,
} from '@/lib/vendure-api';
import { isRateLimited } from '@/lib/rate-limit';

const ADJUST = `mutation Adjust($lineId: ID!, $quantity: Int!) {
  adjustOrderLine(orderLineId: $lineId, quantity: $quantity) {
    __typename
    ... on Order { ${ORDER_FRAGMENT} }
    ... on ErrorResult { errorCode message }
  }
}`;

export const POST: APIRoute = async ({ request }) => {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (isRateLimited(ip, 'cart-adjust', 30, 60_000)) {
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

  const { data, newToken } = await vendureQuery(
    ADJUST,
    { lineId, quantity: qty },
    token,
  );

  const result = data?.adjustOrderLine;
  if (result?.__typename === 'Order') {
    return buildResponse({ order: result }, newToken);
  }
  return buildResponse({ order: null, error: result?.message }, newToken);
};
