import type { APIRoute } from 'astro';
import { shopApiRaw, saveAuthToken } from '@/lib/vendure';
import { SET_CUSTOMER_FOR_ORDER } from '@/lib/mutations';
import { isRateLimitedAsync } from '@/lib/rate-limit';

export const prerender = false;

interface SaveProgressBody {
  fullName?: unknown;
  email?: unknown;
  phone?: unknown;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const GET_ACTIVE_ORDER_CODE = /* GraphQL */ `
  query GetActiveOrderCode {
    activeOrder {
      code
    }
  }
`;

function ok(reason?: string): Response {
  return new Response(JSON.stringify({ ok: !reason, reason }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request }) => {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    if (new URL(origin).host !== host) {
      return new Response('Forbidden', { status: 403 });
    }
  } catch {
    return new Response('Forbidden', { status: 403 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (await isRateLimitedAsync(ip, 'save-progress', 30, 60_000)) {
    return ok('rate-limit');
  }

  let body: SaveProgressBody;
  try {
    body = (await request.json()) as SaveProgressBody;
  } catch {
    return ok('bad-body');
  }

  const fullName = asString(body.fullName);
  const email = asString(body.email);
  const phone = asString(body.phone);

  if (!fullName && !email && !phone) return ok('all-empty');

  let firstName: string;
  let lastName: string;
  if (fullName) {
    const nameParts = fullName.split(/\s+/);
    firstName = nameParts[0];
    lastName = nameParts.slice(1).join(' ') || nameParts[0];
  } else if (email) {
    const local = email.split('@')[0] || 'Klient';
    firstName = local.slice(0, 32);
    lastName = '?';
  } else {
    const last4 = phone.replace(/\D/g, '').slice(-4) || '?';
    firstName = 'Tel';
    lastName = last4;
  }

  const phoneDigits = phone.replace(/\D/g, '');
  let customerEmail = email;
  if (!customerEmail) {
    if (phoneDigits) {
      customerEmail = `tel-${phoneDigits}@phone-checkout.internal`;
    } else {
      try {
        const orderResult = await shopApiRaw<{ activeOrder: { code: string } | null }>(
          GET_ACTIVE_ORDER_CODE,
          {},
          request,
        );
        const code = orderResult.data?.activeOrder?.code;
        if (!code) return ok('no-active-order');
        customerEmail = `cart-${code}@progress.internal`;
      } catch {
        return ok('vendure-error');
      }
    }
  }

  try {
    const result = await shopApiRaw<{
      setCustomerForOrder: { __typename: string };
    }>(
      SET_CUSTOMER_FOR_ORDER,
      {
        input: {
          firstName,
          lastName,
          emailAddress: customerEmail,
          ...(phone ? { phoneNumber: phone } : {}),
        },
      },
      request,
    );

    const response = ok();
    saveAuthToken(result.authToken, response.headers, result.setCookieHeaders);
    return response;
  } catch {
    return ok('vendure-error');
  }
};
