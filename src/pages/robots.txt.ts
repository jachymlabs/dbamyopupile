import type { APIRoute } from "astro";

// Dynamic robots.txt — odpowiedź zależna od hostname requestu.
// Production (dbamyopupile.pl/www.dbamyopupile.pl/localhost) → pełny robots z Disallow dla
// transakcyjnych ścieżek + Sitemap. Dev/preview (dev.dbamyopupile.pl, *.vercel.app) →
// Disallow: / żeby Google nie indeksował dev contentu (dual content / SERP konflikt).
//
// UWAGA: jeśli istnieje `public/robots.txt`, Astro priorytetyzuje plik static
// i ten endpoint NIE zadziała. Plik public/robots.txt został usunięty w tym PR.
//
// Defense-in-depth — równolegle z X-Robots-Tag header w src/middleware.ts.

const INDEXABLE_HOSTS = new Set([
  "dbamyopupile.pl",
  "www.dbamyopupile.pl",
  "localhost",
  "127.0.0.1",
]);

const PRODUCTION_ROBOTS = `User-agent: *
Allow: /
Disallow: /koszyk
Disallow: /checkout
Disallow: /potwierdzenie
Disallow: /upsell
Sitemap: https://dbamyopupile.pl/sitemap-index.xml
`;

const BLOCK_ALL_ROBOTS = `User-agent: *
Disallow: /
`;

export const GET: APIRoute = ({ url }) => {
  const body = INDEXABLE_HOSTS.has(url.hostname)
    ? PRODUCTION_ROBOTS
    : BLOCK_ALL_ROBOTS;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Krótki cache — robots.txt rzadko się zmienia, ale chcemy żeby zmiana
      // (np. dodanie nowej preview env) propagowała szybko.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
};
