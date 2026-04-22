/**
 * Meta Conversions API (server-side) helper.
 * Sends events to Meta's Graph API v24.0 for server-side tracking.
 *
 * IMPORTANT: CAPI Access Token must NEVER be exposed to the client.
 * Token comes from env var META_CAPI_ACCESS_TOKEN (server-side only in Astro SSR).
 * Dataset ID comes from Channel custom field (metaDatasetId) with env var fallback.
 */

const GRAPH_API_VERSION = 'v24.0';

// ─── Types ───────────────────────────────────────────────────────────

export interface CAPIUserData {
  client_ip_address?: string;
  client_user_agent?: string;
  fbc?: string;           // _fbc cookie — raw, NOT hashed
  fbp?: string;           // _fbp cookie — raw, NOT hashed
  em?: string[];           // SHA-256 hashed email(s)
  ph?: string[];           // SHA-256 hashed phone(s)
  fn?: string[];           // SHA-256 hashed first name(s)
  ln?: string[];           // SHA-256 hashed last name(s)
  ct?: string[];           // SHA-256 hashed city
  zp?: string[];           // SHA-256 hashed postal code
  country?: string[];      // SHA-256 hashed country code (e.g. "pl")
  external_id?: string[];  // SHA-256 hashed external ID
}

export interface CAPIEvent {
  event_name: string;
  event_time: number;
  event_id: string;
  event_source_url: string;
  action_source: 'website';
  user_data: CAPIUserData;
  custom_data?: Record<string, any>;
}

export interface CAPIConfig {
  accessToken: string;
  datasetId: string;
}

export interface PII {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  postalCode?: string;
}

// ─── Hashing ─────────────────────────────────────────────────────────

/**
 * Hash a string with SHA-256.
 * Normalizes: lowercase, trim whitespace before hashing.
 * Uses Web Crypto API (works on Vercel Edge + Node 18+).
 */
export async function sha256Hash(value: string): Promise<string> {
  const normalized = value.toLowerCase().trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalize and hash a Polish phone number.
 * Strips +, spaces, dashes, parentheses.
 * Prepends "48" if 9 digits (Polish mobile without country code).
 */
export async function normalizeAndHashPolishPhone(phone: string): Promise<string> {
  if (!phone) return '';
  let normalized = phone.replace(/[\s\-\(\)\+]/g, '').replace(/^00/, '');
  if (normalized.length === 9) {
    normalized = `48${normalized}`;
  }
  return sha256Hash(normalized);
}

// ─── Cookie extraction ──────────────────────────────────────────────

/**
 * Extract _fbc and _fbp cookies from request.
 * These are Meta first-party cookies — sent RAW (NOT hashed).
 */
export function extractFbCookies(request: Request): { fbc?: string; fbp?: string } {
  const cookies = request.headers.get('cookie') || '';
  const fbp = cookies.match(/_fbp=([^;]+)/)?.[1];
  const fbc = cookies.match(/_fbc=([^;]+)/)?.[1];
  return { fbc, fbp };
}

// ─── User data builder ──────────────────────────────────────────────

/**
 * Extract basic user data from Astro request (IP + User-Agent).
 */
export function extractUserData(request: Request): Pick<CAPIUserData, 'client_ip_address' | 'client_user_agent'> {
  return {
    client_ip_address:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      undefined,
    client_user_agent: request.headers.get('user-agent') || undefined,
  };
}

/**
 * Build complete user_data object for CAPI event.
 * Includes IP, UA, fbc/fbp cookies, and hashed PII when available.
 */
export async function buildUserData(request: Request, pii?: PII): Promise<CAPIUserData> {
  const { fbc, fbp } = extractFbCookies(request);
  const { client_ip_address, client_user_agent } = extractUserData(request);

  const userData: CAPIUserData = {
    client_ip_address,
    client_user_agent,
    fbc: fbc || undefined,
    fbp: fbp || undefined,
  };

  if (pii?.email) {
    const hashedEmail = await sha256Hash(pii.email);
    userData.em = [hashedEmail];
    userData.external_id = [hashedEmail];
  }
  if (pii?.phone) {
    const hashedPhone = await normalizeAndHashPolishPhone(pii.phone);
    if (hashedPhone) userData.ph = [hashedPhone];
  }
  if (pii?.firstName) userData.fn = [await sha256Hash(pii.firstName)];
  if (pii?.lastName) userData.ln = [await sha256Hash(pii.lastName)];
  if (pii?.city) userData.ct = [await sha256Hash(pii.city)];
  if (pii?.postalCode) userData.zp = [await sha256Hash(pii.postalCode.replace(/[\s\-]/g, ''))];

  // Always include country for Polish stores
  userData.country = [await sha256Hash('pl')];

  return userData;
}

// ─── CAPI config resolution ─────────────────────────────────────────

/**
 * Get CAPI config.
 * - datasetId: Channel custom field (metaDatasetId) → env var fallback
 * - accessToken: env var only (metaCapiAccessToken is public:false, not available via Shop API)
 *
 * Returns null if no config available (pixel not configured for this channel).
 */
export function getCAPIConfig(channelDatasetId?: string | null): CAPIConfig | null {
  const token = (import.meta.env.META_CAPI_ACCESS_TOKEN || '').trim();
  const datasetId = channelDatasetId?.trim() || (import.meta.env.META_DATASET_ID || '').trim();

  if (!token || !datasetId) return null;

  return { accessToken: token, datasetId };
}

// ─── Send event ─────────────────────────────────────────────────────

/**
 * Send a single event to Meta Conversions API.
 * Fire-and-forget — never blocks page render.
 * Silently fails if credentials are not configured.
 *
 * @param event - The CAPI event to send
 * @param channelDatasetId - Optional datasetId from Channel custom fields (takes priority over env var)
 */
export function sendCAPIEvent(event: CAPIEvent, channelDatasetId?: string | null): void {
  const capiConfig = getCAPIConfig(channelDatasetId);
  if (!capiConfig) return;

  // Fire-and-forget: do NOT await
  fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${capiConfig.datasetId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [event],
      access_token: capiConfig.accessToken,
    }),
  }).catch(() => {
    // Silently fail — do not block checkout/page render
  });
}

// ─── Helper: generate event ID ──────────────────────────────────────

/**
 * Generate a unique event ID for deduplication.
 * Same ID must be used for both browser (fbq) and server (CAPI) events.
 */
export function generateEventId(): string {
  return crypto.randomUUID();
}
