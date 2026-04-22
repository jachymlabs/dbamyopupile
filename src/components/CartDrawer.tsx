import { useEffect, useCallback } from 'react';
import { useCartStore, closeCart, setCartState } from '../lib/cart-store';
import { fetchCart, adjustCartItem, removeFromCart } from '../lib/cart-api';
import { formatPrice, buildAssetUrl } from '../lib/utils';
import type { CartLine } from '../lib/cart-store';
import { ErrorBoundary } from './ErrorBoundary';
import { lockScroll, unlockScroll } from '../lib/scroll-lock';
import { useFocusTrap } from '../lib/use-focus-trap';

import { getFreeShippingThreshold } from '../lib/constants';

function CartLineItem({ line }: { line: CartLine }) {
  const { productVariant } = line;
  const product = productVariant.product;
  const image = product.featuredAsset?.preview;

  const handleQuantityChange = (newQty: number) => {
    if (newQty < 1) return;
    adjustCartItem(line.id, newQty);
  };

  return (
    <div className="flex gap-3 py-4 border-b border-gray-100 last:border-0">
      {/* Image */}
      <a
        href={`/produkty/${product.slug}`}
        className="shrink-0 w-16 h-16 rounded-md overflow-hidden bg-gray-100"
      >
        {image ? (
          <img
            src={buildAssetUrl(image, 'thumb')}
            alt={product.name}
            width={64}
            height={64}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
      </a>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <a
          href={`/produkty/${product.slug}`}
          className="text-sm font-medium text-gray-900 hover:text-gray-700 no-underline line-clamp-1"
        >
          {product.name}
        </a>
        {productVariant.name !== product.name && (
          <p className="text-xs text-gray-500 mt-0.5">{productVariant.name}</p>
        )}
        <p className="text-sm font-medium text-gray-900 mt-1">
          {formatPrice(line.linePriceWithTax)}
        </p>

        {/* Quantity + remove */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex items-center border border-gray-200 rounded-md">
            <button
              type="button"
              onClick={() => handleQuantityChange(line.quantity - 1)}
              disabled={line.quantity <= 1}
              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Zmniejsz ilosc"
            >
              -
            </button>
            <span className="w-7 text-center text-xs font-medium text-gray-900">
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => handleQuantityChange(line.quantity + 1)}
              disabled={line.quantity >= 99}
              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Zwieksz ilosc"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={() => removeFromCart(line.id)}
            className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Usun z koszyka"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function ShippingProgress({ subtotal }: { subtotal: number }) {
  const remaining = getFreeShippingThreshold() - subtotal;
  const progress = Math.min(100, (subtotal / getFreeShippingThreshold()) * 100);
  const isFree = remaining <= 0;

  return (
    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
      {isFree ? (
        <div className="flex items-center gap-1.5 text-sm text-green-700 font-medium">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          Darmowa dostawa!
        </div>
      ) : (
        <p className="text-xs text-gray-600">
          Brakuje Ci <strong>{formatPrice(remaining)}</strong> do darmowej dostawy!
        </p>
      )}
      <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isFree ? 'bg-green-500' : 'bg-gray-900'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

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
    window.addEventListener('cart-updated', handler);
    return () => window.removeEventListener('cart-updated', handler);
  }, []);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      lockScroll();
    } else {
      unlockScroll();
    }
    return () => {
      unlockScroll();
    };
  }, [isOpen]);

  // Focus trap
  const trapRef = useFocusTrap(isOpen);

  // Escape key
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) closeCart();
    },
    [isOpen],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  const lines = order?.lines ?? [];
  const isEmpty = lines.length === 0;

  return (
    <div aria-live="polite">
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={closeCart}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={trapRef}
        className={`fixed z-50 bg-white shadow-xl flex flex-col transition-transform duration-300 ease-out
          inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl sm:rounded-t-none
          sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[420px] sm:max-w-full sm:max-h-full
          ${isOpen ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-y-0 sm:translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Koszyk"
      >
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-10 bg-white/60 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            Koszyk{order && order.totalQuantity > 0 ? ` (${order.totalQuantity})` : ''}
          </h2>
          <button
            type="button"
            onClick={closeCart}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors"
            aria-label="Zamknij koszyk"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isEmpty ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 text-gray-300 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
            <p className="text-sm font-medium text-gray-700 mb-1">Twój koszyk jest jeszcze pusty</p>
            <p className="text-xs text-gray-400 mb-4">Odkryj nasz bestseller i zyskaj darmową dostawę</p>
            <a
              href="/"
              onClick={closeCart}
              className="text-sm font-medium text-gray-900 underline hover:text-gray-700"
            >
              Wróć do sklepu
            </a>
          </div>
        ) : (
          <>
            {/* Free shipping progress */}
            <ShippingProgress subtotal={order?.subTotalWithTax ?? 0} />

            {/* Error message */}
            {error && (
              <div className="px-4 py-2 bg-red-50 text-sm text-red-700">{error}</div>
            )}

            {/* Line items */}
            <div className="flex-1 overflow-y-auto px-4">
              {lines.map((line) => (
                <CartLineItem key={line.id} line={line} />
              ))}
            </div>

            {/* Summary + CTA */}
            <div className="shrink-0 border-t border-gray-200 px-4 py-4 space-y-3">
              {order?.discounts?.map((d, i) => (
                <div key={i} className="flex justify-between text-sm text-green-700">
                  <span>{d.description}</span>
                  <span>-{formatPrice(Math.abs(d.amountWithTax))}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm text-gray-600">
                <span>Suma czesciowa</span>
                <span>{formatPrice(order?.subTotalWithTax ?? 0)}</span>
              </div>
              {(order?.shippingWithTax ?? 0) > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Dostawa</span>
                  <span>{formatPrice(order?.shippingWithTax ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold text-gray-900 pt-2 border-t border-gray-100">
                <span>Razem</span>
                <span>{formatPrice(order?.totalWithTax ?? 0)}</span>
              </div>
              <a
                href="/checkout"
                className="block w-full rounded-lg bg-gray-900 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-gray-800 transition-colors no-underline min-h-[44px] leading-[44px]"
              >
                Przejdz do kasy
              </a>
              <button
                type="button"
                onClick={closeCart}
                className="block w-full text-center text-sm text-gray-500 hover:text-gray-700 transition-colors py-1"
              >
                Kontynuuj zakupy
              </button>
            </div>
          </>
        )}
      </div>
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
