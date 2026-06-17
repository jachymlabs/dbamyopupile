/* eslint-disable no-undef */
// Config file runs w Node — console, fetch, AbortSignal sa native (Node 20+),
// ale eslint flat config nie ma node globals dla *.mjs config files.
// Disable lokalnie zamiast modyfikowac eslint.config.js globalnie.
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';

// site MUSI matchowac runtime origin bo Astro security CSRF check uzywa site
// niezaleznie od security.checkOrigin: false (Astro 6 / Vercel adapter ignore).
// Aktualizuj rownolegle z PUBLIC_SITE_URL w Vercel env po zmianie domeny.
const SITE_URL = 'https://dbamyopupile.pl';

/**
 * Build-time fetch slugow z Vendure pod dynamic routes (produkty + kolekcje).
 * @astrojs/sitemap skanuje TYLKO statyczne `.astro` pages — dynamic [slug] routes
 * nie sa wykrywane, wiec produkty / kolekcje nie trafiaja do sitemap-0.xml,
 * a Google ich nie indeksuje. Fetch przy buildzie -> przekazujemy URLe przez
 * `customPages` (merge do sitemap-0.xml).
 *
 * Defensive: brak ENV / fetch error nie wywala builda — log warning, sitemap
 * leci dalej tylko ze stronami statycznymi. Lepiej niepelny sitemap niz padajacy build.
 */
async function fetchDynamicUrls() {
  const apiUrl = (process.env.VENDURE_API_URL || '').trim();
  const channelToken = (process.env.VENDURE_CHANNEL_TOKEN || '').trim();

  if (!apiUrl || !channelToken) {
    console.warn('[sitemap] VENDURE_API_URL lub VENDURE_CHANNEL_TOKEN brak — pomijam dynamic URLs (sitemap bedzie zawieral tylko strony statyczne).');
    return [];
  }

  // Vendure Shop API ma cap `take: 100` (USER_INPUT_ERROR przy wiekszym).
  // Dla Doodie 13 produktow w MVP — 100 to bezpieczny headroom. Jesli kiedys
  // przekroczymy 100, dodaj pagination loop (skip + take).
  const query = /* GraphQL */ `
    query SitemapData {
      products(options: { take: 100 }) {
        items { slug }
      }
      collections(options: { take: 100 }) {
        items { slug }
      }
    }
  `;

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'vendure-token': channelToken,
      },
      body: JSON.stringify({ query }),
      // 10s safety timeout — sitemap build nie moze wisiec w nieskonczonosc
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`[sitemap] Vendure HTTP ${res.status} — pomijam dynamic URLs.`);
      return [];
    }

    const json = await res.json();
    if (json.errors) {
      console.warn('[sitemap] Vendure GraphQL errors — pomijam dynamic URLs.');
      return [];
    }

    const productSlugs = json.data?.products?.items ?? [];
    const collectionSlugs = json.data?.collections?.items ?? [];

    const urls = [
      ...productSlugs.map((p) => `${SITE_URL}/produkty/${p.slug}`),
      ...collectionSlugs.map((c) => `${SITE_URL}/kolekcje/${c.slug}`),
    ];

    console.log(`[sitemap] Dodaje ${productSlugs.length} produktow + ${collectionSlugs.length} kolekcji do sitemap.`);
    return urls;
  } catch (err) {
    console.warn('[sitemap] Fetch dynamic URLs nieudany:', err?.message || err);
    return [];
  }
}

const dynamicUrls = [...(await fetchDynamicUrls())];

export default defineConfig({
  site: SITE_URL,
  output: 'server',
  adapter: vercel(),
  // Region SSR funkcji = fra1 (Frankfurt) — patrz vercel.json `regions` / `functions`.
  // @astrojs/vercel v10 nie wspiera `regions` w config adaptera (tylko via vercel.json).
  security: {
    checkOrigin: false,
  },
  integrations: [
    sitemap({
      // Wyklucz strony niepubliczne / transakcyjne — są w robots.txt Disallow
      // i mają noindex w meta. Google by reportował "Submitted URL blocked
      // by robots.txt" gdyby były tutaj wpisane.
      filter: (page) => !/\/(checkout|koszyk|potwierdzenie|upsell)(\/|$)/.test(page),
      // customPages: URLe ktore plugin doda do sitemap-0.xml obok stron statycznych.
      // Build-time fetch (rzadko zmienne dane — 13 produktow, redeploy przy zmianie).
      customPages: dynamicUrls,
    }),
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
    envPrefix: ['PUBLIC_', 'VENDURE_', 'META_'],
    server: {
      // Pozwol na arbitrary Host header w dev mode — potrzebne do testowania
      // hostname-aware middleware/routes (np. noindex dla dev.doodie.pl) lokalnie.
      // Production (Vercel) i tak ma wlasciwe handling Host headera.
      allowedHosts: true,
    },
  },
  server: {
    port: 4321,
    host: true,
  },
});
