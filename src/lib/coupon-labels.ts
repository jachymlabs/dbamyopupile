/**
 * Friendly display names dla wewnętrznych kodów promocyjnych. User nie powinien
 * widzieć `MOODLES_GIFT` / `FREE_SHIP_99` w UI — to są nazwy promotion w Vendure,
 * pomocne dla nas (auto-coupon flow w cart-helpers.ts), ale dla klienta to noise.
 *
 * Mapowanie po `discount.description` (= `promotion.name` z Vendure admin).
 */
const COUPON_DISPLAY_NAMES: Record<string, string> = {
  MOODLES_GIFT: "Miniprzewodnik (e-book) — gratis",
};

/**
 * Kody które należy CAŁKOWICIE UKRYĆ w liście discounts. Powód: efekt promocji
 * jest już widoczny w innym miejscu UI, pokazanie kodu = duplikat.
 *
 * - `FREE_SHIP_99` — efekt to "Dostawa Gratis" w wierszu Shipping z crossout.
 *   Pokazanie osobnej linii "-9.99 zł" myli usera (wygląda jak druga promocja).
 */
const HIDDEN_COUPON_DESCRIPTIONS = new Set(["FREE_SHIP_99"]);

export function getCouponDisplayName(
  rawDescription: string | undefined | null,
): string {
  const trimmed = (rawDescription || "").trim();
  return COUPON_DISPLAY_NAMES[trimmed] || trimmed;
}

export function isHiddenCoupon(
  rawDescription: string | undefined | null,
): boolean {
  return HIDDEN_COUPON_DESCRIPTIONS.has((rawDescription || "").trim());
}
