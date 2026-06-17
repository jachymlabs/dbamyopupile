import type { APIRoute } from 'astro';
import {
  getToken,
  vendureQuery,
  buildResponse,
  ORDER_FRAGMENT,
} from '@/lib/vendure-api';
import { withCartGuards, parseCartBody } from '@/lib/cart-helpers';

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

function validateCouponCode(value: unknown): { code: string } | { error: Response } {
  if (!value || typeof value !== 'string') {
    return { error: buildResponse({ order: null, error: 'Kod rabatowy jest wymagany' }) };
  }
  if (value.length > 50) {
    return { error: buildResponse({ order: null, error: 'Kod rabatowy jest za dlugi' }) };
  }
  return { code: value.trim() };
}

/** POST: Apply coupon code */
export const POST: APIRoute = withCartGuards(
  { rateLimitKey: 'coupon-apply', rateLimitMax: 10 },
  async ({ request }) => {
    const token = getToken(request);
    const parsed = await parseCartBody<{ couponCode?: unknown }>(request);
    if ('error' in parsed) return parsed.error;

    const validated = validateCouponCode(parsed.data.couponCode);
    if ('error' in validated) return validated.error;

    const { data, newToken } = await vendureQuery(
      APPLY_COUPON,
      { couponCode: validated.code },
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
  },
);

/** DELETE: Remove coupon code.
 * HIGH-2: dodano rate-limit (10/min) — bez tego endpoint mozna spamowac petlami
 * (kazdy DELETE = 1 query do Vendure DB, recalc promo-context, zaprasza DoS-style abuse). */
export const DELETE: APIRoute = withCartGuards(
  { rateLimitKey: 'coupon-remove', rateLimitMax: 10 },
  async ({ request }) => {
    const token = getToken(request);
    const parsed = await parseCartBody<{ couponCode?: unknown }>(request);
    if ('error' in parsed) return parsed.error;

    const validated = validateCouponCode(parsed.data.couponCode);
    if ('error' in validated) return validated.error;

    const { data, newToken } = await vendureQuery(
      REMOVE_COUPON,
      { couponCode: validated.code },
      token,
    );

    const result = data?.removeCouponCode;
    if (result?.__typename === 'Order') {
      return buildResponse({ order: result }, newToken);
    }
    return buildResponse({ order: null, error: 'Nie udalo sie usunac kodu' }, newToken);
  },
);
