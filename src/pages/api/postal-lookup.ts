import type { APIRoute } from 'astro';
import { isRateLimited } from '@/lib/rate-limit';

export const GET: APIRoute = async ({ request, url }) => {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (isRateLimited(ip, 'postal-lookup', 20, 60_000)) {
    return new Response(JSON.stringify({ cities: [] }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const code = url.searchParams.get('code');
  if (!code || !/^\d{2}-\d{3}$/.test(code)) {
    return new Response(JSON.stringify({ cities: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch(`https://kodpocztowy.intami.pl/api/${code}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ cities: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json() as Array<{ miejscowosc: string }>;
    // Extract unique city names
    const cities = [...new Set(data.map((r) => r.miejscowosc))].sort();

    return new Response(JSON.stringify({ cities }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ cities: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
