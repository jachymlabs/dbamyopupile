import type { APIRoute } from "astro";
import { getToken, vendureQuery, buildResponse } from "@/lib/vendure-api";
import { isRateLimitedAsync } from "@/lib/rate-limit";

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
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  // 120 req/min/IP (= 2 req/s) — BLIK waiting screen polluje co 1s
  // (src/pages/checkout/blik-waiting.astro). Endpoint zwraca tylko payment
  // status (Settled/Cancelled/Pending) — brak PII, więc 120 OK security-wise.
  if (await isRateLimitedAsync(ip, "payment-status", 120, 60_000)) {
    return new Response(JSON.stringify({ status: "RATE_LIMITED" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = getToken(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // H5 (Sprint 2): when a `code` is supplied, the response MUST NOT distinguish
  // between "this code does not exist" and "this code exists but isn't yours" —
  // both must return an opaque 404. Returning a {status: 'FAILED'} 200 in either
  // case lets an attacker enumerate valid order codes (16-char alphanum is
  // already hard to brute force, but defense-in-depth is cheap).
  //
  // Vendure shop-api orderByCode already enforces session ownership server-side
  // (returns null for foreign orders), so we only need to translate "null result"
  // into a uniform 404 here.
  if (code) {
    // Light input shape check — keeps obvious junk out of upstream queries.
    if (
      typeof code !== "string" ||
      code.length > 50 ||
      !/^[A-Za-z0-9_-]+$/.test(code)
    ) {
      return new Response(JSON.stringify({ status: "NOT_FOUND" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
    const { data, newToken } = await vendureQuery(
      ORDER_BY_CODE_PAYMENTS,
      { code },
      token,
    );
    const order = data?.orderByCode;
    if (!order) {
      // Same response for "doesn't exist" and "not yours".
      return new Response(JSON.stringify({ status: "NOT_FOUND" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
    return buildPaymentResponse(order, newToken);
  }

  // No code → poll active session order (legitimate use by confirmation page).
  const { data, newToken } = await vendureQuery(
    ACTIVE_ORDER_PAYMENTS,
    {},
    token,
  );
  return buildPaymentResponse(data?.activeOrder, newToken);
};

function buildPaymentResponse(order: any, newToken?: string) {
  if (!order) {
    return buildResponse({ status: "FAILED" as const }, newToken);
  }

  const payuPayment = order.payments?.find(
    (p: { method: string }) => p.method === "payu",
  );

  if (!payuPayment) {
    return buildResponse(
      { status: "PENDING" as const, orderCode: order.code },
      newToken,
    );
  }

  if (payuPayment.state === "Settled") {
    return buildResponse(
      { status: "COMPLETED" as const, orderCode: order.code },
      newToken,
    );
  }

  if (payuPayment.state === "Error" || payuPayment.state === "Cancelled") {
    return buildResponse(
      { status: "FAILED" as const, orderCode: order.code },
      newToken,
    );
  }

  return buildResponse(
    { status: "PENDING" as const, orderCode: order.code },
    newToken,
  );
}
