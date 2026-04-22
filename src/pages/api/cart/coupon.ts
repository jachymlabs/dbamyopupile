import type { APIRoute } from 'astro';
import {
  getToken,
  vendureQuery,
  buildResponse,
  ORDER_FRAGMENT,
} from '@/lib/vendure-api';
import { isRateLimited } from '@/lib/rate-limit';

const APPLY_COUPON = `mutation ApplyCouponCode($couponCode: String!) {
  applyCouponCode(couponCode: $couponCode) {
    __typename
    ... on Order { ${ORDER_FRAGMENT} couponCodes }
    ... on CouponCodeExpiredError { errorCode message }
    ... on CouponCodeInvalidError { errorCode message }
    ... on CouponCodeLimitError { errorCode message }
  }
}`;

const REMOVE_COUPON = `mutation RemoveCouponCode($couponCode: String!) {
  removeCouponCode(couponCode: $couponCode) {
    __typename
    ... on Order { ${ORDER_FRAGMENT} couponCodes }
  }
}`;

/** POST: Apply coupon code */
export const POST: APIRoute = async ({ request }) => {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (isRateLimited(ip, 'coupon-apply', 10, 60_000)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
  }

  const token = getToken(request);
  let body: any;
  try {
    body = await request.json();
  } catch {
    return buildResponse({ order: null, error: 'Invalid request body' });
  }
  const { couponCode } = body;

  if (!couponCode || typeof couponCode !== 'string') {
    return buildResponse({ order: null, error: 'Kod rabatowy jest wymagany' });
  }
  if (couponCode.length > 50) {
    return buildResponse({ order: null, error: 'Kod rabatowy jest za dlugi' });
  }

  const { data, newToken } = await vendureQuery(
    APPLY_COUPON,
    { couponCode: couponCode.trim() },
    token,
  );

  const result = data?.applyCouponCode;
  if (result?.__typename === 'Order') {
    return buildResponse({ order: result }, newToken);
  }
  return buildResponse(
    { order: null, error: result?.message || 'Nieprawidlowy kod rabatowy' },
    newToken,
  );
};

/** DELETE: Remove coupon code */
export const DELETE: APIRoute = async ({ request }) => {
  const token = getToken(request);
  let body: any;
  try {
    body = await request.json();
  } catch {
    return buildResponse({ order: null, error: 'Invalid request body' });
  }
  const { couponCode } = body;

  if (!couponCode || typeof couponCode !== 'string') {
    return buildResponse({ order: null, error: 'Kod rabatowy jest wymagany' });
  }
  if (couponCode.length > 50) {
    return buildResponse({ order: null, error: 'Kod rabatowy jest za dlugi' });
  }

  const { data, newToken } = await vendureQuery(
    REMOVE_COUPON,
    { couponCode: couponCode.trim() },
    token,
  );

  const result = data?.removeCouponCode;
  if (result?.__typename === 'Order') {
    return buildResponse({ order: result }, newToken);
  }
  return buildResponse({ order: null, error: 'Nie udalo sie usunac kodu' }, newToken);
};
