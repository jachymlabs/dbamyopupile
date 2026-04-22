/**
 * Format Vendure price (in cents/grosze) to display string.
 * Example: 7500 → "75,00 zł"
 */
export function formatPrice(priceInCents: number, currencyCode = 'PLN'): string {
  if (!Number.isFinite(priceInCents)) return '0,00 zł';
  const amount = priceInCents / 100;
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format price range from Vendure search results.
 * If min === max, show single price. Otherwise "od X".
 */
export function formatPriceRange(
  priceWithTax: { __typename: string; min?: number; max?: number; value?: number },
  currencyCode = 'PLN',
): string {
  if (priceWithTax.__typename === 'SinglePrice' && priceWithTax.value != null) {
    return formatPrice(priceWithTax.value, currencyCode);
  }
  if (priceWithTax.min != null && priceWithTax.max != null) {
    if (priceWithTax.min === priceWithTax.max) {
      return formatPrice(priceWithTax.min, currencyCode);
    }
    return `od ${formatPrice(priceWithTax.min, currencyCode)}`;
  }
  return '';
}

/**
 * Build Vendure asset URL with optional preset.
 * Vendure returns `preview` URL directly — we just append preset/format params.
 */
export function buildAssetUrl(preview: string, preset: 'tiny' | 'thumb' | 'small' | 'medium' | 'large' = 'medium'): string {
  if (!preview) return '';
  const separator = preview.includes('?') ? '&' : '?';
  return `${preview}${separator}preset=${preset}&format=webp`;
}
