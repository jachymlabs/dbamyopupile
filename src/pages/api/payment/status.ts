import type { APIRoute } from 'astro';
import {
  getToken,
  vendureQuery,
  buildResponse,
} from '@/lib/vendure-api';
import { isRateLimited } from '@/lib/rate-limit';

const ACTIVE_ORDER_PAYMENTS = `query {
  activeOrder {
    id
    code
    state
    payments {
      id
      state
      method
      transactionId
      metadata
    }
  }
}`;

const ORDER_BY_CODE_PAYMENTS = `query OrderByCode($code: String!) {
  orderByCode(code: $code) {
    id
    code
    state
    payments {
      id
      state
      method
      transactionId
      metadata
    }
  }
}`;

export const GET: APIRoute = async ({ request }) => {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (isRateLimited(ip, 'payment-status', 30, 60_000)) {
    return new Response(JSON.stringify({ status: 'RATE_LIMITED' }), { status: 429 });
  }

  const token = getToken(request);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  let order: any = null;

  if (code) {
    // Look up by order code (used by BLIK waiting page)
    const { data, newToken } = await vendureQuery(ORDER_BY_CODE_PAYMENTS, { code }, token);
    order = data?.orderByCode;
    if (order) {
      return buildPaymentResponse(order, newToken);
    }
  }

  // Fallback: active order
  const { data, newToken } = await vendureQuery(ACTIVE_ORDER_PAYMENTS, {}, token);
  order = data?.activeOrder;

  return buildPaymentResponse(order, newToken);
};

function buildPaymentResponse(order: any, newToken?: string) {
  if (!order) {
    return buildResponse({ status: 'FAILED' as const }, newToken);
  }

  const payuPayment = order.payments?.find(
    (p: { method: string }) => p.method === 'payu',
  );

  if (!payuPayment) {
    return buildResponse({ status: 'PENDING' as const, orderCode: order.code }, newToken);
  }

  if (payuPayment.state === 'Settled') {
    return buildResponse({ status: 'COMPLETED' as const, orderCode: order.code }, newToken);
  }

  if (payuPayment.state === 'Error' || payuPayment.state === 'Cancelled') {
    return buildResponse({ status: 'FAILED' as const, orderCode: order.code }, newToken);
  }

  return buildResponse({ status: 'PENDING' as const, orderCode: order.code }, newToken);
}
