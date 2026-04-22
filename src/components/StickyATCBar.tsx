import { useState, useEffect, useRef } from 'react';
import { addToCart } from '../lib/cart-api';

interface Props {
  productName: string;
  price: number;
  variantId: string;
  currencyCode?: string;
  observeSelector?: string;
}

export default function StickyATCBar({
  productName,
  price,
  variantId,
  currencyCode = 'PLN',
  observeSelector = '#primary-atc-btn',
}: Props) {
  const [visible, setVisible] = useState(false);
  const [adding, setAdding] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Small delay to ensure Astro has rendered the target element
    const timer = setTimeout(() => {
      const target = document.querySelector(observeSelector);
      if (!target) return;

      const obs = new IntersectionObserver(
        ([entry]) => setVisible(!entry.isIntersecting),
        { threshold: 0, rootMargin: '0px' },
      );
      obs.observe(target);
      observerRef.current = obs;
    }, 100);

    return () => {
      clearTimeout(timer);
      observerRef.current?.disconnect();
    };
  }, [observeSelector]);

  const handleAdd = async () => {
    setAdding(true);
    await addToCart(variantId, 1);
    setAdding(false);
  };

  const formattedPrice = new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: currencyCode,
  }).format(price / 100);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] transition-transform duration-300 ${visible ? 'translate-y-0' : 'translate-y-full'}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{productName}</p>
          <p className="text-sm text-gray-600">{formattedPrice}</p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="shrink-0 rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 transition-colors min-h-[44px]"
        >
          {adding ? 'Dodawanie...' : 'Dodaj do koszyka'}
        </button>
      </div>
    </div>
  );
}
