import type { APIRoute } from 'astro';
import { isRateLimitedAsync } from '@/lib/rate-limit';

// H4 (Sprint 2): per-instance in-memory cache for postal codes.
// Polish postal codes (~30k) are effectively immutable on a 1h horizon, and the
// upstream API (kodpocztowy.intami.pl) has unknown rate limits — caching server-side
// turns repeat lookups for the same code into 0-RTT free responses.
// Note: per-instance only on Vercel (each lambda has its own Map). That's fine —
// hot codes (e.g. 00-001 for testing) get cached on whichever instance serves them.
const POSTAL_TTL_MS = 60 * 60 * 1000; // 1h
const POSTAL_MAX = 5_000;
const postalCache = new Map<string, { cities: string[]; expiresAt: number }>();

function cachePut(code: string, cities: string[]) {
  if (postalCache.size >= POSTAL_MAX) {
    // Evict ~20% of stalest entries (cheap-ish O(n) walk; cache is small).
    const now = Date.now();
    const toEvict: string[] = [];
    for (const [k, v] of postalCache) {
      if (now >= v.expiresAt) toEvict.push(k);
    }
    if (toEvict.length === 0) {
      // No expired entries — drop the first 1000 (insertion order).
      let i = 0;
      for (const k of postalCache.keys()) {
        toEvict.push(k);
        if (++i >= 1000) break;
      }
    }
    for (const k of toEvict) postalCache.delete(k);
  }
  postalCache.set(code, { cities, expiresAt: Date.now() + POSTAL_TTL_MS });
}

function cacheGet(code: string): string[] | null {
  const hit = postalCache.get(code);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    postalCache.delete(code);
    return null;
  }
  return hit.cities;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  // Allow CDN edge caching for 5 min, browser for 0 (we want server-side cache
  // to dominate since postal codes are stable but the response can change).
  'Cache-Control': 'public, max-age=0, s-maxage=300',
};

export const GET: APIRoute = async ({ request, url }) => {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';

  const code = url.searchParams.get('code');
  if (!code || !/^\d{2}-\d{3}$/.test(code)) {
    return new Response(JSON.stringify({ cities: [] }), { headers: JSON_HEADERS });
  }

  // Cache check BEFORE rate limit — repeat lookups for the same code are free
  // and shouldn't burn the limiter budget.
  const cached = cacheGet(code);
  if (cached) {
    return new Response(JSON.stringify({ cities: cached }), { headers: JSON_HEADERS });
  }

  if (await isRateLimitedAsync(ip, 'postal-lookup', 20, 60_000)) {
    return new Response(JSON.stringify({ cities: [] }), {
      status: 429,
      headers: JSON_HEADERS,
    });
  }

  try {
    const res = await fetch(`https://kodpocztowy.intami.pl/api/${code}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ cities: [] }), { headers: JSON_HEADERS });
    }

    const data = await res.json() as Array<{ miejscowosc: string }>;
    // Extract unique city names
    const cities = [...new Set(data.map((r) => r.miejscowosc))].sort();
    cachePut(code, cities);

    return new Response(JSON.stringify({ cities }), { headers: JSON_HEADERS });
  } catch {
    return new Response(JSON.stringify({ cities: [] }), { headers: JSON_HEADERS });
  }
};
