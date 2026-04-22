# DbamyOPupile.pl

Sklep z akcesoriami dla pupili. Vendure (headless ecommerce) + Astro 6 (storefront).

## Quick start

```bash
npm install
cp .env.example .env  # uzupelnij wartosci (juz prefilled w .env)
npm run dev
```

Strona: http://localhost:4321

## Stack

- Astro 6 SSR (adapter `@astrojs/vercel`)
- React 19 (komponenty interaktywne — cart drawer, sticky ATC)
- Tailwind 4 (CSS-based config w `src/styles/global.css`)
- TypeScript 5
- GraphQL (`graphql-request`) → Vendure Shop API

## Env vars

```
VENDURE_API_URL=https://vendure.jachymlabs.pl/shop-api
VENDURE_CHANNEL_TOKEN=dbamyopupile-shop
PUBLIC_SITE_URL=https://dbamyopupile.pl
PUBLIC_COOKIE_DOMAIN=.dbamyopupile.pl  # ustaw jak domena bedzie aktywna
PUBLIC_META_PIXEL_ID=                  # opcjonalne
META_CAPI_ACCESS_TOKEN=                # opcjonalne
META_DATASET_ID=                       # opcjonalne
```

W Vercel ustaw te same env vars dla `production`. **UWAGA:** zero trailing whitespace/newline (boli `/api/cart` 500).

## Deploy

- **Auto:** push na `main` -> Vercel deploy automatycznie (jesli `vercel git connect` zadzialalo)
- **Manualny:** `vercel --prod`

## Pelny flow: dodaj produkt -> stworz strone

### 1. Dodaj produkt w Vendure Dashboard

1. https://vendure.jachymlabs.pl/admin -> przelacz channel na **dbamyopupile**
2. Catalog -> Products -> **Create new product**
3. Wypelnij: nazwa, slug (np. `kulka-do-powolnego-karmienia`), opis, zdjecia
4. Stworz wariant: SKU, cena w **GROSZACH** (8999 = 89.99 zl), stock
5. Save

Pelna instrukcja: `docs/dodawanie-produktow.md`

### 2. Stworz custom strone produktowa

```bash
cp src/pages/produkty/_szablon.astro src/pages/produkty/kulka-do-powolnego-karmienia.astro
```

Otworz plik, zmien `PRODUCT_SLUG = '...'` na slug z Vendure, dopisz HTML+Tailwind w `<!-- CUSTOM SECTIONS -->`.

Pelna instrukcja: `docs/tworzenie-stron-produktowych.md`

### 3. Push

```bash
git add . && git commit -m "feat: dodaj strone Kulka do powolnego karmienia" && git push
```

Vercel zrobi auto-deploy.

## Brand colors (Tailwind classes)

```html
<div class="bg-brand-canvas text-brand-text">
  <h1 class="text-brand-secondary">Naglowek</h1>
  <button class="bg-brand-secondary text-brand-canvas">CTA</button>
  <span class="bg-brand-primary text-brand-text">Badge</span>
</div>
```

| Token              | Hex       |
|--------------------|-----------|
| `brand-primary`    | `#B8D8E8` |
| `brand-secondary`  | `#1E3A5F` |
| `brand-canvas`     | `#FAF7F2` |
| `brand-text`       | `#1A1A1A` |

## Przyklady sekcji HTML+Tailwind

### Hero z CTA

```astro
<section class="bg-brand-canvas py-24">
  <div class="mx-auto max-w-3xl px-4 text-center">
    <h1 class="text-5xl font-bold text-brand-text">Tytul</h1>
    <p class="mt-4 text-lg text-brand-text/70">Podtytul</p>
    <a href="#cta" class="mt-8 inline-block bg-brand-secondary text-brand-canvas px-8 py-4 rounded-lg font-semibold hover:opacity-90">
      Zamow
    </a>
  </div>
</section>
```

### Karty zalet (3 kolumny)

```astro
<section class="py-16">
  <div class="mx-auto max-w-7xl px-4 grid grid-cols-1 sm:grid-cols-3 gap-8">
    <div class="bg-brand-primary rounded-2xl p-6 text-center">
      <h3 class="font-semibold text-brand-text">Tytul</h3>
      <p class="text-sm text-brand-text/80 mt-2">Opis</p>
    </div>
    <!-- ... -->
  </div>
</section>
```

### Sekcja z ciemnym tlem

```astro
<section class="bg-brand-secondary text-brand-canvas py-24">
  <div class="mx-auto max-w-3xl px-4 text-center">
    <h2 class="text-4xl font-bold">Naglowek na ciemnym tle</h2>
    <p class="mt-4 opacity-90">Tekst</p>
  </div>
</section>
```

## Struktura plikow

```
src/
  components/         # UI primitives (Button, Price, ProductCard, ...) - nie ruszaj bez powodu
  layouts/
    BaseLayout.astro  # html shell + meta + Header/Footer
  lib/
    vendure.ts        # GraphQL client + auth token handling
    queries.ts        # GraphQL queries (GET_PRODUCT_DETAIL itd.)
    mutations.ts      # GraphQL mutations (ADD_TO_CART itd.)
    store-config.ts   # fetch channel custom fields (storeName, contactEmail, ...)
  pages/
    index.astro       # strona glowna
    produkty/
      [slug].astro    # dynamiczny fallback dla kazdego produktu (z Vendure)
      _szablon.astro  # szablon do kopiowania na custom strony produktowe
      <slug>.astro    # custom strony per produkt
    kolekcje/[slug].astro  # listing kolekcji
    koszyk.astro      # cart
    checkout/         # checkout FSM (1-shipping, 2-payment, 3-confirm)
    api/              # Vendure proxy endpoints (cart, checkout, ...)
  styles/
    global.css        # Tailwind 4 import + @theme tokens + base styles
  types/
    vendure.ts        # types z Vendure GraphQL
```

## Przydatne linki

- **Vendure Admin:** https://vendure.jachymlabs.pl/admin
- **Vendure Shop API:** https://vendure.jachymlabs.pl/shop-api
- **Vercel project:** https://vercel.com/jachymlabs/dbamyopupile
- **GitHub:** https://github.com/jachymlabs/dbamyopupile
- **Boilerplate source:** https://github.com/jachymlabs/astro-storefront-pl
