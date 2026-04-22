import type { APIRoute } from 'astro';
import {
  getToken,
  vendureQuery,
  buildResponse,
  ORDER_FRAGMENT,
} from '@/lib/vendure-api';
import { isRateLimited } from '@/lib/rate-limit';
import { sendCAPIEvent, buildUserData, generateEventId } from '@/lib/meta-capi';
import { getStoreConfig } from '@/lib/store-config';

const GET_ACTIVE_ORDER = `query { activeOrder { ${ORDER_FRAGMENT} } }`;

const ADD_TO_CART = `mutation AddToCart($variantId: ID!, $quantity: Int!) {
  addItemToOrder(productVariantId: $variantId, quantity: $quantity) {
    __typename
    ... on Order { ${ORDER_FRAGMENT} }
    ... on ErrorResult { errorCode message }
  }
}`;

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
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (isRateLimited(ip, 'cart-add', 30, 60_000)) {
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

  try {
    const { data, newToken } = await vendureQuery(
      ADD_TO_CART,
      { variantId, quantity: qty },
      token,
    );

    const result = data?.addItemToOrder;
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
      return buildResponse({ order: result }, newToken);
    }
    return buildResponse({ order: null, error: result?.message }, newToken);
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
