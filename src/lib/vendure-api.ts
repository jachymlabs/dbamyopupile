/**
 * Thin wrapper around vendure.ts for API routes (browser -> Astro server -> Vendure).
 * Used by src/pages/api/cart/*.ts and src/pages/api/payment/*.ts endpoints.
 *
 * All core fetch logic lives in vendure.ts (shopApiRaw).
 * This file provides API-route-specific helpers: getToken, vendureQuery, buildResponse.
 */

import { shopApiRaw, AUTH_COOKIE } from './vendure';

export { AUTH_COOKIE };

/**
 * Extract Vendure auth token from request cookies.
 */
export function getToken(request: Request): string | undefined {
  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`));
  return match?.[1];
}

/**
 * Execute a GraphQL query/mutation against Vendure Shop API.
 * Wraps shopApiRaw from vendure.ts, adapting the interface for API routes
 * (token string in, { data, newToken } out).
 */
export async function vendureQuery<T = any>(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
): Promise<{ data: T; newToken?: string }> {
  // Build a minimal Request-like object so shopApiRaw can extract the auth token.
  // API routes already parsed the token via getToken(), so we pass it as a cookie header.
  const headers = new Headers();
  if (token) {
    headers.set('Cookie', `${AUTH_COOKIE}=${token}`);
  }
  const fakeRequest = new Request('http://localhost', { headers });

  const result = await shopApiRaw<any>(query, variables, fakeRequest);
  return { data: result.data, newToken: result.authToken };
}

/**
 * Build a JSON Response with optional Set-Cookie header for new auth token.
 */
export function buildResponse(body: unknown, newToken?: string, status = 200): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, private',
  });
  if (newToken) {
    const isProduction = !(process.env.VENDURE_API_URL || '').trim().includes('localhost');
    const cookieDomain = (process.env.PUBLIC_COOKIE_DOMAIN || '').trim();
    headers.append(
      'Set-Cookie',
      `${AUTH_COOKIE}=${newToken}; Path=/; HttpOnly; SameSite=Lax;${isProduction ? ' Secure;' : ''}${isProduction && cookieDomain ? ` Domain=${cookieDomain};` : ''} Max-Age=31536000`,
    );
  }
  return new Response(JSON.stringify(body), { status, headers });
}

// Re-export ORDER_FRAGMENT from single source of truth
export { ORDER_FRAGMENT } from './fragments';
