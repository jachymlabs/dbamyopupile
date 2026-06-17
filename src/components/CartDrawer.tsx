import { useEffect, useCallback, useRef } from "react";
import { useCartStore, closeCart, setCartState } from "../lib/cart-store";
import { fetchCart, adjustCartItem, removeFromCart } from "../lib/cart-api";
import { formatPrice, buildAssetUrl } from "../lib/utils";
import type { CartLine } from "../lib/cart-store";
import { ErrorBoundary } from "./ErrorBoundary";
import { lockScroll, unlockScroll } from "../lib/scroll-lock";
import { useFocusTrap } from "../lib/use-focus-trap";
import { getFreeShippingThreshold } from "../lib/constants";
import { getCouponDisplayName, isHiddenCoupon } from "../lib/coupon-labels";

// BONUS product slugs — ebook (2+ Moodles) + brelok (Tier 3, 5+ Moodles).
// Oba to gifty: GRATIS pill, bez X (usuwanie), bez qty toggle. Match po slug,
// nie variant ID, bo Vendure może rotować ID przy reimport produktu.
const BONUS_PRODUCT_SLUGS = ["miniprzewodnik", "brelok-fasola"];
// Friendly names + ukrywanie internal kuponów (FREE_SHIP_99 duplikuje
// "Dostawa Gratis") → coupon-labels.ts.

/* ============================================ */
/* CartLineItem — pojedynczy produkt w drawer    */
/* ============================================ */
function CartLineItem({ line }: { line: CartLine }) {
  const { productVariant } = line;
  const product = productVariant.product;
  // Prefer variant's own featuredAsset (per-variant zdjęcie z Vendure), fallback do product.
  const image =
    productVariant.featuredAsset?.preview ?? product.featuredAsset?.preview;
  const isBonus = BONUS_PRODUCT_SLUGS.includes(product.slug);
  // Atrybuty wariantu — "Kolor: Niebieski", "Rozmiar: M" itd.
  const options = productVariant.options ?? [];

  const handleQuantityChange = (newQty: number) => {
    if (newQty < 1) return;
    adjustCartItem(line.id, newQty);
  };

  return (
    <div className="dd-cart-item">
      {/* Image */}
      <a
        href={isBonus ? "/" : `/produkty/${product.slug}`}
        className="dd-cart-item-img"
      >
        {image ? (
          <img
            src={buildAssetUrl(image, "thumb")}
            alt={product.name}
            width={96}
            height={96}
          />
        ) : (
          <div className="dd-cart-item-img-empty">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 28 }}
            >
              image
            </span>
          </div>
        )}
      </a>

      {/* Details */}
      <div className="dd-cart-item-info">
        <div className="dd-cart-item-header">
          <a
            href={isBonus ? "/" : `/produkty/${product.slug}`}
            className="dd-cart-item-name"
          >
            {product.name}
          </a>
          {!isBonus && (
            <button
              type="button"
              onClick={() => removeFromCart(line.id)}
              className="dd-cart-item-remove"
              aria-label="Usuń z koszyka"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 20 }}
              >
                delete
              </span>
            </button>
          )}
        </div>

        {/* Atrybuty wariantu — Kolor: Niebieski, Rozmiar: M itd. */}
        {!isBonus && options.length > 0 && (
          <ul className="dd-cart-item-options">
            {options.map((o) => (
              <li
                key={o.id ?? `${o.group.code}-${o.code}`}
                className="dd-cart-item-option"
              >
                <span className="dd-cart-item-option-label">
                  {o.group.name}:
                </span>
                <span className="dd-cart-item-option-value">{o.name}</span>
              </li>
            ))}
          </ul>
        )}

        {isBonus ? (
          <div className="dd-cart-item-bonus">
            <span className="dd-cart-item-bonus-pill">GRATIS</span>
          </div>
        ) : (
          <div className="dd-cart-item-row">
            {/* Quantity toggle pill */}
            <div className="dd-cart-qty-pill">
              <button
                type="button"
                onClick={() => handleQuantityChange(line.quantity - 1)}
                disabled={line.quantity <= 1}
                aria-label="Zmniejsz ilość"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16 }}
                >
                  remove
                </span>
              </button>
              <span className="dd-cart-qty-value">{line.quantity}</span>
              <button
                type="button"
                onClick={() => handleQuantityChange(line.quantity + 1)}
                disabled={line.quantity >= 99}
                aria-label="Zwiększ ilość"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16 }}
                >
                  add
                </span>
              </button>
            </div>

            <p className="dd-cart-item-price">
              {formatPrice(line.linePriceWithTax)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================ */
/* ShippingProgress — pasek darmowej dostawy      */
/* ============================================ */
function ShippingProgress({ subtotal }: { subtotal: number }) {
  const threshold = getFreeShippingThreshold();
  const remaining = Math.max(0, threshold - subtotal);
  const progress = Math.min(100, (subtotal / threshold) * 100);
  const isFree = remaining <= 0 && subtotal > 0;

  return (
    <div
      className={`dd-cart-shipping ${isFree ? "dd-cart-shipping--free" : ""}`}
    >
      <div className="dd-cart-shipping-text">
        {isFree ? (
          <p>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 16, verticalAlign: "middle", marginRight: 4 }}
            >
              check_circle
            </span>
            Masz <strong>darmową dostawę</strong>!
          </p>
        ) : (
          <p>
            Brakuje <strong>{formatPrice(remaining)}</strong> do darmowej
            dostawy
          </p>
        )}
      </div>
      <div className="dd-cart-shipping-track">
        <div
          className="dd-cart-shipping-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="dd-cart-shipping-threshold">
        Darmowa dostawa od {formatPrice(threshold)}
      </p>
    </div>
  );
}

/* ============================================ */
/* CartDrawerInner — główna logika                */
/* ============================================ */
function CartDrawerInner() {
  const { isOpen, order, loading, error } = useCartStore();

  // Fetch cart on mount
  useEffect(() => {
    fetchCart();
  }, []);

  // Listen for cart-updated events from Astro scripts
  useEffect(() => {
    const handler = (e: Event) => {
      const order = (e as CustomEvent).detail;
      setCartState({ order, isOpen: true });
    };
    window.addEventListener("cart-updated", handler);
    return () => window.removeEventListener("cart-updated", handler);
  }, []);

  // Lock scroll. Unlock DEFERRED do końca close animation (320ms transition) —
  // bez tego body styles wracają natychmiast i background "skacze" do scrollY
  // gdy drawer jeszcze slide'uje w dół.
  //
  // CRITICAL BUG FIX: gdy user re-open'uje drawer podczas pending unlock (przed
  // upływem 320ms), trzeba TYLKO anulować timer — NIE wołać lockScroll() ponownie,
  // bo body jest jeszcze fizycznie zablokowane (count > 0). Bez tego count
  // akumulował się przy każdym re-open, body zostawało permanentnie position:fixed
  // → "panel u góry nie działa" + "strona scrolluje się w dół" przy close.
  const unlockTimerRef = useRef<number | null>(null);
  const isLockedRef = useRef(false);
  useEffect(() => {
    if (isOpen) {
      if (unlockTimerRef.current !== null) {
        // Body jeszcze zablokowane z poprzedniego open — tylko cancel pending unlock,
        // NIE wołaj lockScroll (count by się zdublował).
        clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      } else if (!isLockedRef.current) {
        // Fresh lock — body nie jest zablokowane
        lockScroll();
        isLockedRef.current = true;
      }
    } else if (isLockedRef.current && unlockTimerRef.current === null) {
      // Schedule unlock dopiero gdy faktycznie zablokowane i nie ma już pending
      unlockTimerRef.current = window.setTimeout(() => {
        unlockScroll();
        isLockedRef.current = false;
        unlockTimerRef.current = null;
      }, 320);
    }
  }, [isOpen]);

  // Cleanup na unmount — natychmiastowy unlock
  useEffect(() => {
    return () => {
      if (unlockTimerRef.current !== null) {
        clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
      if (isLockedRef.current) {
        unlockScroll();
        isLockedRef.current = false;
      }
    };
  }, []);

  // Focus trap + Escape
  const trapRef = useFocusTrap(isOpen);
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) closeCart();
    },
    [isOpen],
  );
  useEffect(() => {
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  const lines = order?.lines ?? [];
  const isEmpty = lines.length === 0;

  return (
    <div aria-live="polite" className="dd-cart-root">
      {/* Backdrop */}
      <div
        className={`dd-cart-backdrop ${isOpen ? "dd-cart-backdrop--open" : ""}`}
        onClick={closeCart}
        aria-hidden="true"
      />

      {/* Drawer panel — Stitch design */}
      <aside
        ref={trapRef}
        className={`dd-cart-drawer ${isOpen ? "dd-cart-drawer--open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Koszyk"
        aria-hidden={!isOpen}
      >
        {/* Loading bar */}
        {loading && (
          <div className="dd-cart-loading" aria-hidden="true">
            <div className="dd-cart-loading-bar" />
          </div>
        )}

        {/* Header */}
        <header className="dd-cart-header">
          <h2 className="dd-cart-title">
            Twój koszyk
            {order && order.totalQuantity > 0 && (
              <span className="dd-cart-badge">{order.totalQuantity}</span>
            )}
          </h2>
          <button
            type="button"
            onClick={closeCart}
            className="dd-cart-close"
            aria-label="Zamknij koszyk"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 22 }}
            >
              close
            </span>
          </button>
        </header>

        {isEmpty ? (
          /* Empty state */
          <div className="dd-cart-empty">
            <div className="dd-cart-empty-icon">
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 36 }}
              >
                shopping_bag
              </span>
            </div>
            <p className="dd-cart-empty-title">Koszyk jest pusty</p>
            <p className="dd-cart-empty-text">
              Wróć do sklepu i wybierz coś dla siebie.
            </p>
            <a href="/sklep" onClick={closeCart} className="dd-cart-empty-cta">
              Przejdź do sklepu
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 18 }}
              >
                arrow_forward
              </span>
            </a>
          </div>
        ) : (
          <>
            {/* Shipping progress */}
            <ShippingProgress subtotal={order?.subTotalWithTax ?? 0} />

            {/* Error message */}
            {error && <div className="dd-cart-error">{error}</div>}

            {/* Line items scroll area */}
            <div className="dd-cart-list">
              {lines.map((line) => (
                <CartLineItem key={line.id} line={line} />
              ))}
            </div>

            {/* Sticky bottom — summary + CTA */}
            <div className="dd-cart-bottom">
              {/* Discounts — pomijamy internal coupony oznaczone jako ukryte
                  w coupon-labels.ts (np. FREE_SHIP_99 — duplikat "Dostawy Gratis").
                  Pozostałe pokazujemy pod friendly name (MOODLES_GIFT → "Miniprzewodnik..."). */}
              {order?.discounts
                ?.filter((d) => !isHiddenCoupon(d.description))
                .map((d, i) => {
                  const displayName = getCouponDisplayName(d.description);
                  const isGift = /ebook|gratis/i.test(displayName);
                  return (
                    <div key={i} className="dd-cart-discount-row">
                      <span className="dd-cart-discount-label">
                        <span
                          className="material-symbols-outlined"
                          style={{
                            fontSize: 16,
                            color: "var(--brand-primary)",
                          }}
                        >
                          {isGift ? "redeem" : "local_offer"}
                        </span>
                        {displayName}
                      </span>
                      <span className="dd-cart-discount-value">
                        −{formatPrice(Math.abs(d.amountWithTax))}
                      </span>
                    </div>
                  );
                })}

              {/* Razem (final total, no separate shipping/tax disclaimer) */}
              <div className="dd-cart-subtotal">
                <span>Razem</span>
                <span className="dd-cart-subtotal-value">
                  {formatPrice(order?.totalWithTax ?? 0)}
                </span>
              </div>

              {/* Checkout CTA — Stitch primary pill */}
              <a href="/checkout" className="dd-cart-checkout-btn">
                Przejdź do kasy
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 20 }}
                >
                  arrow_forward
                </span>
              </a>

              <button
                type="button"
                onClick={closeCart}
                className="dd-cart-continue"
              >
                Kontynuuj zakupy
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

export default function CartDrawer() {
  return (
    <ErrorBoundary>
      <CartDrawerInner />
    </ErrorBoundary>
  );
}
