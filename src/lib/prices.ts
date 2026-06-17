/**
 * Per-product regular prices.
 * Reads src/data/prices.json — bez integracji Vendure backendu.
 * Frontend porównuje regularPrice z aktualnym priceWithTax — jeśli > → strikethrough w UI.
 */
import pricesData from '../data/prices.json';

export interface ProductPrice {
  regularPrice: number; // grosze
  variants?: Record<string, number>; // per-variant override w grosze, klucze typu "mini-4"
  note?: string;
}

const data = pricesData as Record<string, ProductPrice | { description?: string }>;

/**
 * Get regular price (grosze) dla danego slug produktu. Null jeśli brak.
 */
export function getRegularPrice(slug: string): number | null {
  const entry = data[slug];
  if (!entry || !('regularPrice' in entry)) return null;
  return (entry as ProductPrice).regularPrice;
}

/**
 * Per-variant regular price (grosze). Pattern-matchuje rozmiar (mini/maxi)
 * i ilość (4/8) w variantName i szuka klucza w `variants` mapie.
 * Fallback do product-level regularPrice.
 */
export function getVariantRegularPrice(slug: string, variantName: string): number | null {
  const entry = data[slug];
  if (!entry || !('regularPrice' in entry)) return null;
  const p = entry as ProductPrice;
  if (!p.variants) return p.regularPrice;
  const n = variantName.toLowerCase();
  const size = n.includes('maxi') ? 'maxi' : (n.includes('mini') ? 'mini' : null);
  const qty = /\b8\b/.test(n) ? '8' : (/\b4\b/.test(n) ? '4' : null);
  if (size && qty) {
    const key = `${size}-${qty}`;
    if (p.variants[key] != null) return p.variants[key];
  }
  return p.regularPrice;
}

/**
 * Compute sale info na podstawie regular + current.
 * Zwraca null jeśli regular nie wyższe lub brak danych.
 */
export interface SaleInfo {
  regularPrice: number;
  currentPrice: number;
  discountPercent: number;
  savings: number;
  regularFormatted: string;
  savingsFormatted: string;
}

export function computeSale(slug: string, currentPriceGrosze: number): SaleInfo | null {
  const regular = getRegularPrice(slug);
  if (!regular || regular <= currentPriceGrosze) return null;
  const fmt = (g: number) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(g / 100);
  return {
    regularPrice: regular,
    currentPrice: currentPriceGrosze,
    discountPercent: Math.round(((regular - currentPriceGrosze) / regular) * 100),
    savings: regular - currentPriceGrosze,
    regularFormatted: fmt(regular),
    savingsFormatted: fmt(regular - currentPriceGrosze),
  };
}
