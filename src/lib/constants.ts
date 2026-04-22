/** Free shipping threshold in grosze. Reads from data-free-shipping on body (set by BaseLayout from Channel config). */
export function getFreeShippingThreshold(): number {
  if (typeof document !== 'undefined') {
    const val = document.body?.getAttribute('data-free-shipping');
    if (val) return parseInt(val, 10);
  }
  return 15000; // fallback for SSR and missing attribute
}

/** @deprecated Use getFreeShippingThreshold() instead. Kept for backward compat during migration. */
export const FREE_SHIPPING_THRESHOLD = 15000;
