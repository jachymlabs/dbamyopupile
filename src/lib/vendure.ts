// process.env for runtime resolution (not baked at build time)
const API_URL = (process.env.VENDURE_API_URL || import.meta.env.VENDURE_API_URL || 'http://localhost:3000/shop-api').trim();
const CHANNEL_TOKEN = (process.env.VENDURE_CHANNEL_TOKEN || import.meta.env.VENDURE_CHANNEL_TOKEN || '').trim();
const AUTH_TOKEN_COOKIE = 'vendure-auth-token';

/** Cookie name exported for use by API route helpers (vendure-api.ts). */
export const AUTH_COOKIE = AUTH_TOKEN_COOKIE;

interface ShopApiResult<T> {
  data: T;
  /** New auth token from Vendure (if returned). Must be saved as cookie. */
  authToken?: string;
  /** Set-Cookie headers from Vendure that should be forwarded to the browser. */
  setCookieHeaders?: string[];
}

/**
 * Get auth token from Astro request cookies.
 */
function getAuthToken(request?: Request): string | undefined {
  if (!request) return undefined;
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`${AUTH_TOKEN_COOKIE}=([^;]+)`));
  return match?.[1];
}

/**
 * Execute a GraphQL operation against the Vendure Shop API.
 * Uses token-based auth (vendure-auth-token) stored in a cookie.
 */
export async function shopApi<T>(
  document: string,
  variables?: Record<string, unknown>,
  request?: Request,
): Promise<T> {
  const result = await shopApiRaw<T>(document, variables, request);
  return result.data;
}

/**
 * Raw version that also returns the auth token and Set-Cookie headers.
 * Use when you need to save the token as cookie (mutations that modify session).
 */
export async function shopApiRaw<T>(
  document: string,
  variables?: Record<string, unknown>,
  request?: Request,
): Promise<ShopApiResult<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (CHANNEL_TOKEN) {
    headers['vendure-token'] = CHANNEL_TOKEN;
  }

  // Forward auth token as Bearer header (SSR proxy pattern — single auth method)
  const authToken = getAuthToken(request);
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: document, variables }),
  });

  const json = await response.json() as { data: T; errors?: unknown[] };

  if (json.errors) {
    // H8 (Sprint 2): NEVER leak raw Vendure / GraphQL error text to the caller —
    // it has historically contained stack traces, internal field names, and even
    // SQL fragments depending on Vendure's debug level. Log the full payload
    // server-side and throw an opaque message that's safe to bubble up to UI.
    const raw = json.errors;
    if (import.meta.env.DEV || process.env.NODE_ENV !== 'production') {
      console.error('[vendure] GraphQL error:', JSON.stringify(raw).slice(0, 2000));
    } else {
      // In prod, still log but truncate aggressively to avoid log bloat / PII spillover.
      try {
        const first = (raw as any[])[0];
        console.error('[vendure] GraphQL error:', {
          message: typeof first?.message === 'string' ? first.message.slice(0, 200) : 'unknown',
          path: first?.path,
          extensions: first?.extensions?.code,
        });
      } catch {
        console.error('[vendure] GraphQL error: <unserializable>');
      }
    }
    // Generic, user-safe error. Callers may catch and display their own message.
    const err = new Error('Vendure request failed');
    (err as any).isVendureError = true;
    throw err;
  }

  // Extract new auth token from Vendure response
  const newToken = response.headers.get('vendure-auth-token') || undefined;

  // Collect all Set-Cookie headers from Vendure to forward to the browser
  const setCookieHeaders: string[] = [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      setCookieHeaders.push(value);
    }
  });

  return {
    data: json.data,
    authToken: newToken,
    setCookieHeaders: setCookieHeaders.length > 0 ? setCookieHeaders : undefined,
  };
}

/**
 * Build Set-Cookie header value for the auth token.
 */
function buildAuthCookie(authToken: string): string {
  const maxAge = 60 * 60 * 24 * 365;
  const isProduction = !API_URL.includes('localhost');
  const secure = isProduction ? ' Secure;' : '';
  const cookieDomain = (process.env.PUBLIC_COOKIE_DOMAIN || import.meta.env.PUBLIC_COOKIE_DOMAIN || '').trim();
  const domain = isProduction && cookieDomain ? ` Domain=${cookieDomain};` : '';
  return `${AUTH_TOKEN_COOKIE}=${authToken}; Path=/; HttpOnly; SameSite=Lax;${secure}${domain} Max-Age=${maxAge}`;
}

/**
 * Save the Vendure auth token as a cookie on the Astro response.
 * Also forwards any Set-Cookie headers from Vendure.
 * Call after shopApiRaw() when a new token is returned.
 */
export function saveAuthToken(
  authToken: string | undefined,
  responseHeaders: Headers,
  setCookieHeaders?: string[],
): void {
  if (authToken) {
    responseHeaders.append('Set-Cookie', buildAuthCookie(authToken));
  }
  // Forward Vendure's Set-Cookie headers to the browser
  if (setCookieHeaders) {
    for (const cookie of setCookieHeaders) {
      responseHeaders.append('Set-Cookie', cookie);
    }
  }
}

/**
 * Redirect with auth token cookie preserved.
 * Use instead of Astro.redirect() after mutations — Astro.redirect() drops response headers.
 */
export function redirectWithToken(
  url: string,
  authToken?: string,
): Response {
  const headers = new Headers({ Location: url });
  if (authToken) {
    headers.append('Set-Cookie', buildAuthCookie(authToken));
  }
  return new Response(null, { status: 302, headers });
}
