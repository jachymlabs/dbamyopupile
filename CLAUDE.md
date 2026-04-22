# CLAUDE.md — DbamyOPupile.pl

Sklep z akcesoriami dla pupili. Vendure 3.x (headless) + Astro 6 (storefront).

## Stack

- **Storefront:** Astro 6 + React 19 + Tailwind 4 + TypeScript 5
- **Backend:** Vendure 3.x (Digital Ocean droplet)
- **Hosting:** Vercel (adapter `@astrojs/vercel`)
- **Plynnosc/cart:** server-side sessions (Vendure auth token w cookie)
- **Platnosci:** PayU (online) + COD (za pobraniem)
- **Wysylka:** InPost Paczkomat (9.99 zl) / Kurier (14.99) / Kurier COD (19.99)

## Backend (Vendure)

| Pole              | Wartosc                                  |
|-------------------|------------------------------------------|
| Channel ID        | **6**                                    |
| Channel code      | `dbamyopupile`                           |
| Channel token     | `dbamyopupile-shop`                      |
| API URL           | `https://vendure.jachymlabs.pl/shop-api` |
| Admin URL         | `https://vendure.jachymlabs.pl/admin`    |
| Currency          | PLN                                      |
| Language          | pl                                       |
| pricesIncludeTax  | true (ceny w GROSZACH, brutto)           |

### Payment methods (channel context)

| ID  | Code   | Nazwa                          |
|-----|--------|--------------------------------|
| 9   | `payu` | PayU (online)                  |
| 10  | `cod`  | Platnosc przy odbiorze (COD)   |

### Shipping methods (channel context)

| ID  | Code                      | Nazwa                                         | Cena        |
|-----|---------------------------|-----------------------------------------------|-------------|
| 14  | `inpost-paczkomat`        | Paczkomat InPost                              | 9.99 zl     |
| 15  | `inpost-kurier`           | Kurier InPost                                 | 14.99 zl    |
| 16  | `inpost-kurier-pobranie`  | Kurier InPost — platnosc przy odbiorze        | 19.99 zl    |

## Brand colors

| Token              | Hex       | Zastosowanie                              |
|--------------------|-----------|-------------------------------------------|
| `brand-primary`    | `#B8D8E8` | akcenty, ikony, badge (pastelowy blekit)  |
| `brand-secondary`  | `#1E3A5F` | guziki primary, pogrubienia (granatowy)   |
| `brand-canvas`     | `#FAF7F2` | tlo strony / sekcji (kremowy off-white)   |
| `brand-text`       | `#1A1A1A` | body, naglowki (prawie czarny)            |

Dostepne jako:
- **Tailwind classes:** `bg-brand-primary`, `text-brand-text`, `border-brand-secondary` itd.
- **CSS vars:** `var(--brand-primary)`, `var(--brand-secondary)` itd.

Zdefiniowane w `src/styles/global.css` (Tailwind 4 `@theme` + `:root` CSS vars).

## Jak tworzyc strony produktowe

1. Dodaj produkt w Vendure Dashboard (slug = nazwa pliku) — patrz `docs/dodawanie-produktow.md`
2. Skopiuj szablon: `cp src/pages/produkty/_szablon.astro src/pages/produkty/<slug>.astro`
3. Zmien `PRODUCT_SLUG` w pliku na slug produktu
4. Pisz HTML + Tailwind w sekcji `<!-- CUSTOM SECTIONS -->` (zalety, FAQ, recenzje, jak uzywac)
5. Wszystko poza CUSTOM SECTIONS zostaw — to ATC form, breadcrumbs, Pixel, JSON-LD

Szczegoly: `docs/tworzenie-stron-produktowych.md`

## Czego NIE ruszac

- `src/pages/api/*` — Vendure proxy (cart, checkout, webhook)
- `src/lib/vendure.ts` — GraphQL client
- `src/lib/store-config.ts` — channel custom fields fetcher
- `src/pages/koszyk.astro`, `src/pages/checkout/*` — checkout FSM
- `src/pages/produkty/[slug].astro` — fallback dynamic product page (dziala dla kazdego produktu bez custom strony)

## Ceny — KRYTYCZNE

- Vendure trzyma ceny w **GROSZACH** (integer)
- 8999 = 89.99 zl
- `pricesIncludeTax: true` w channel — ceny ktorych dotykasz API to **brutto z VAT 23%**
- Storefront wyswietla `priceWithTax` formatowane przez `Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })`

## Linki do docs

- `README.md` — quick start, deploy, struktura
- `docs/dodawanie-produktow.md` — krok po kroku w Vendure Dashboard
- `docs/tworzenie-stron-produktowych.md` — custom strony per produkt

## Deploy

Vercel auto-deploy z `main` branch. Manualny: `vercel --prod`.
