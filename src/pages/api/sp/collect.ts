/**
 * POST /api/sp/collect — behawioralny pixel (Warstwa 1, reverse-proxy).
 *
 * Same-origin endpoint storefrontu który:
 *   1. Ustawia 1st-party cookie `sp_vid` (visitor_id, 400 dni) — server-side,
 *      więc ITP/ETP Safari NIE skraca go do 7 dni jak cookie z JS.
 *   2. Forwarduje event batch do Cockpitu (`/api/pixel/ingest`) z nagłówkiem
 *      `X-SP-Domain` = host storefrontu (Cockpit rozpoznaje sklep po domenie,
 *      ZERO per-store tokenów/sekretów na storefroncie — reusable boilerplate).
 *
 * ZERO Meta — całkowicie osobne od `MetaPixel.astro` / meta-capi.
 *
 * Fail-safe / graceful: ZAWSZE zwraca 204 (nawet gdy forward padnie, body
 * brak/zły JSON). Pixel = best-effort telemetria, NIGDY nie może zepsuć
 * storefrontu ani spowolnić nawigacji klienta. Brak rate-limit / same-origin
 * guard tutaj celowo — to nie endpoint transakcyjny, a fetch jest keepalive
 * z naszego własnego inline skryptu.
 */

import type { APIRoute } from "astro";

// Cockpit ingest endpoint. Override przez env (np. preview/staging), fallback
// hardcoded żeby działało out-of-the-box na każdym sklepie bez per-store env.
const COCKPIT_INGEST_URL = (
  import.meta.env.COCKPIT_INGEST_URL ||
  "https://astro-cockpit.vercel.app/api/pixel/ingest"
).trim();

// visitor_id cookie — 400 dni (max akceptowany przez Chrome dla Max-Age).
const VID_COOKIE = "sp_vid";
const VID_MAX_AGE = 34_560_000; // 400 dni w sekundach

// Forward timeout — Cockpit ingest nie może blokować response storefrontu.
const FORWARD_TIMEOUT_MS = 2_000;

// FIX 2 — stabilna tożsamość: gdy cookie nie przetrwa (in-app browser IG/FB),
// deterministyczny visitor_id = hash(ip+ua+salt) → ten sam device = ten sam id.
// envPrefix (astro.config) nie obejmuje PIXEL_ → process.env (server-side) + fallback const.
const VISITOR_SALT = process.env.PIXEL_VISITOR_SALT || "doodie-sp-vid-2026";

// FIX 3 — known-bot UA: nie forwardujemy crawlerów/headless do analityki behawioralnej.
const BOT_UA =
  /bot|crawler|spider|facebookexternalhit|facebot|headless|lighthouse|pingdom|uptimerobot|gtmetrix|curl|wget|python-requests|axios|node-fetch/i;

type CollectBody = {
  session_id?: unknown;
  events?: unknown;
  source?: unknown;
  campaign?: unknown;
};

/** Prosta heurystyka device_type z User-Agent. */
function detectDevice(ua: string): "mobile" | "tablet" | "desktop" {
  const s = ua.toLowerCase();
  // Tablet najpierw — iPad / Android bez "mobile" / generyczne "tablet".
  if (
    /ipad/.test(s) ||
    /tablet/.test(s) ||
    (/android/.test(s) && !/mobile/.test(s))
  ) {
    return "tablet";
  }
  if (
    /mobi|iphone|ipod|android.*mobile|windows phone|blackberry|iemobile/.test(s)
  ) {
    return "mobile";
  }
  return "desktop";
}

/** Prosta heurystyka OS z User-Agent. */
function detectOs(ua: string): string {
  const s = ua.toLowerCase();
  if (/windows/.test(s)) return "Windows";
  if (/iphone|ipad|ipod/.test(s)) return "iOS";
  if (/mac os x|macintosh/.test(s)) return "macOS";
  if (/android/.test(s)) return "Android";
  if (/linux/.test(s)) return "Linux";
  return "unknown";
}

/**
 * FIX 1 — realny IP klienta z nagłówków Vercel. Request browser→storefront MA
 * prawdziwy IP użytkownika (x-forwarded-for[0]); to ten IP forwardujemy dalej
 * do Cockpitu (który własny x-forwarded-for ma = nasz serwer fra1, NIE usera).
 */
function clientIpFrom(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

/**
 * FIX 2 — deterministyczny visitor_id = sha256(ip|ua|salt). Web Crypto (jak
 * meta-capi.ts). Null gdy brak IP → caller fallbackuje na crypto.randomUUID().
 * In-app browser gubi cookie → ten sam device (ip+ua) dostaje TEN SAM id.
 */
async function stableVisitorId(
  ip: string | null,
  ua: string,
): Promise<string | null> {
  if (!ip) return null;
  try {
    const data = new TextEncoder().encode(`${ip}|${ua}|${VISITOR_SALT}`);
    const buf = await crypto.subtle.digest("SHA-256", data);
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `v_${hex.slice(0, 30)}`;
  } catch {
    return null;
  }
}

// 204 No Content — jedna instancja reużywana dla wszystkich ścieżek (success +
// wszystkie graceful failure). keepalive fetch klienta i tak ignoruje body.
const NO_CONTENT = () => new Response(null, { status: 204 });

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // ── UA + bot skip (FIX 3) ──
    const ua = request.headers.get("user-agent") || "";
    if (BOT_UA.test(ua)) return NO_CONTENT();

    // ── Realny IP + kraj klienta (FIX 1) — forwardujemy dalej do Cockpitu ──
    const clientIp = clientIpFrom(request);
    const country = request.headers.get("x-vercel-ip-country") || null;

    // ── visitor_id: cookie → deterministyczny hash(ip+ua) (FIX 2) → randomUUID ──
    let visitorId = cookies.get(VID_COOKIE)?.value;
    if (!visitorId) {
      visitorId = (await stableVisitorId(clientIp, ua)) ?? crypto.randomUUID();
      cookies.set(VID_COOKIE, visitorId, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: VID_MAX_AGE,
      });
    }

    // ── Body: best-effort parse. Zły/brak JSON → i tak 204 (cookie już set). ──
    let body: CollectBody;
    try {
      body = (await request.json()) as CollectBody;
    } catch {
      return NO_CONTENT();
    }

    const sessionId =
      typeof body.session_id === "string" ? body.session_id : "";
    const events = Array.isArray(body.events) ? body.events : [];
    const source = typeof body.source === "string" ? body.source : undefined;
    const campaign =
      typeof body.campaign === "string" ? body.campaign : undefined;

    // Brak eventów = nic do forwardowania (cookie i tak ustawione powyżej).
    if (events.length === 0) {
      return NO_CONTENT();
    }

    // ── Wzbogać o device/os z UA + host storefrontu (rozpoznanie sklepu) ──
    const host = request.headers.get("host") || "";

    const payload = {
      visitor_id: visitorId,
      session_id: sessionId,
      events,
      device_type: detectDevice(ua),
      os: detectOs(ua),
      source,
      campaign,
    };

    // ── Forward do Cockpitu (BEZ store_token — Cockpit mapuje po X-SP-Domain). ──
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
    try {
      await fetch(COCKPIT_INGEST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SP-Domain": host,
          // FIX 1 — realny IP + kraj klienta (Cockpit ma własne nagłówki = serwer fra1).
          ...(clientIp ? { "X-SP-Client-IP": clientIp } : {}),
          ...(country ? { "X-SP-Country": country } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      // Cockpit down / timeout — NIE blokuj storefrontu. Loguj tylko w dev.
      if (import.meta.env.DEV)
        console.error("[api/sp/collect] forward failed:", err);
    } finally {
      clearTimeout(timeoutId);
    }

    return NO_CONTENT();
  } catch (err) {
    // Cokolwiek poszło nie tak (np. cookies API) — pixel nie wywala renderu.
    if (import.meta.env.DEV) console.error("[api/sp/collect] unexpected:", err);
    return NO_CONTENT();
  }
};
