import { defineMiddleware } from "astro:middleware";

// CSP — whitelist domen z których dopuszczamy zasoby.
// Hosty wpisane na podstawie obecnego stacku:
//   - script: connect.facebook.net (pixel), geowidget.inpost.pl (SDK)
//   - style/font: fonts.googleapis.com / fonts.gstatic.com
//   - img: https: (Vendure assets, Meta tracking beacons, Inpost mapy)
//   - frame: secure.payu.com (PayU widgety), geowidget.inpost.pl (mapa paczkomatów)
//   - form-action: secure.payu.com (PayU redirect/PAYPO)
//   - connect: facebook (CAPI/pixel beacon), inpost API
//
// 'unsafe-inline' w script-src i style-src konieczne dla
// <script is:inline define:vars={...}> + Tailwind inline styles.
// Future: nonce-based CSP zamiast unsafe-inline.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net https://geowidget.inpost.pl https://geowidget-app.inpost.pl",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://connect.facebook.net https://www.facebook.com https://geowidget.inpost.pl https://geowidget-app.inpost.pl https://api-shipx-pl.easypack24.net https://api.web3forms.com",
  "frame-src 'self' https://secure.payu.com https://secure.snd.payu.com https://merch-prod.snd.payu.com https://geowidget.inpost.pl https://geowidget-app.inpost.pl",
  "form-action 'self' https://secure.payu.com https://secure.snd.payu.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

// Whitelist hostów które MAJĄ być indeksowane przez Google.
// Wszystko poza tą listą (dev.dbamyopupile.pl, *.vercel.app preview URLs) dostaje
// X-Robots-Tag: noindex — żeby dev/preview nie konkurował z prod w SERP-ach.
// localhost/127.0.0.1 też nie potrzebują noindex (nie crawlable z internetu),
// ale są w whiteliście dla czytelności lokalnego dev.
const INDEXABLE_HOSTS = new Set([
  "dbamyopupile.pl",
  "www.dbamyopupile.pl",
  "localhost",
  "127.0.0.1",
]);

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  // Headers działające na każdy request, niezależnie od page-level kodu.
  // Dla statycznych assetów (np. CSS/JS w /_astro/*) Vercel + vercel.json
  // ustawiają cache headers — tutaj dodajemy security baseline.
  response.headers.set("Content-Security-Policy", CSP);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=()",
  );
  // X-Frame-Options jest legacy (zastąpione przez frame-ancestors w CSP),
  // ale niektóre starsze browsery PL mogą go używać — zostawiamy dla compat.
  response.headers.set("X-Frame-Options", "DENY");

  // noindex dla wszystkich hostów spoza whitelisty (dev.dbamyopupile.pl, preview URLs).
  // Defense-in-depth — równolegle z dynamic /robots.txt (src/pages/robots.txt.ts).
  // Header czytany przez Googlebot nawet jak ktoś znajdzie link do dev env.
  const hostname = new URL(context.request.url).hostname;
  if (!INDEXABLE_HOSTS.has(hostname)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  return response;
});
