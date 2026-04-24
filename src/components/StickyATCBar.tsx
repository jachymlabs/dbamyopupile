import { useState, useEffect, useRef } from 'react';
import { addToCart } from '../lib/cart-api';
import { getCartState } from '../lib/cart-store';

interface Props {
  productName: string;
  price: number;
  variantId: string;
  currencyCode?: string;
  observeSelector?: string;
  scrollThreshold?: number;
  imageUrl?: string;
  compactName?: string;
}

export default function StickyATCBar({
  productName,
  price,
  variantId,
  currencyCode = 'PLN',
  observeSelector = '#primary-atc-btn',
  scrollThreshold,
  imageUrl,
  compactName,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [adding, setAdding] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundleQty, setBundleQty] = useState(1);
  const [overridePrice, setOverridePrice] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Listen for bundle changes from PDP form
  useEffect(() => {
    const onBundleChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { qty: number; priceText: string };
      if (detail?.qty) setBundleQty(detail.qty);
      if (detail?.priceText) setOverridePrice(detail.priceText);
    };
    window.addEventListener('wm-bundle-change', onBundleChange);
    return () => window.removeEventListener('wm-bundle-change', onBundleChange);
  }, []);

  useEffect(() => {
    if (typeof scrollThreshold === 'number') {
      let ticking = false;
      const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const docHeight = document.documentElement.scrollHeight - window.innerHeight;
          const scrolled = window.scrollY;
          const percent = docHeight > 0 ? (scrolled / docHeight) * 100 : 0;
          setVisible(percent >= scrollThreshold);
          ticking = false;
        });
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      return () => window.removeEventListener('scroll', onScroll);
    }

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
  }, [observeSelector, scrollThreshold]);

  const handleAdd = async () => {
    setAdding(true);
    setError(null);
    await addToCart(variantId, bundleQty);
    setAdding(false);
    // M14: addToCart cichło na network fail (cart-api error: null) i pokazywaliśmy
    // "Dodano" mimo niepowodzenia. Teraz sprawdzamy cart-store.error po await.
    const cartErr = getCartState().error;
    if (cartErr) {
      setError(cartErr);
      setTimeout(() => setError(null), 4000);
      return;
    }
    setSuccess(true);
    setTimeout(() => setSuccess(false), 1800);
  };

  const formattedPrice = overridePrice || new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: currencyCode,
  }).format(price / 100);

  const displayName = compactName || productName;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-out ${visible ? 'translate-y-0' : 'translate-y-full'}`}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: 'rgba(255, 255, 255, 0.94)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderTop: '1px solid #B8D8E8',
        boxShadow: '0 -8px 24px rgba(30, 58, 95, 0.10), 0 -1px 4px rgba(30, 58, 95, 0.05)',
      }}
    >
      <div className="mx-auto max-w-7xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-3 sm:gap-4">
        {imageUrl && (
          <div
            className="shrink-0 rounded-xl overflow-hidden bg-white"
            style={{ width: '52px', height: '52px', border: '1px solid #E5E7EB' }}
          >
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center 40%' }}
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p
            className="truncate text-[11px] sm:text-xs uppercase tracking-wider"
            style={{ color: '#9CA3AF', fontWeight: 500, letterSpacing: '0.06em', lineHeight: 1.2 }}
          >
            {displayName}
          </p>
          <p
            className="leading-none mt-0.5 sm:mt-1"
            style={{
              color: '#1E3A5F',
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontWeight: 700,
              fontSize: 'clamp(18px, 4.5vw, 22px)',
              letterSpacing: '-0.015em',
            }}
          >
            {formattedPrice}
          </p>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || success}
          className="shrink-0 inline-flex items-center justify-center gap-2 transition-all"
          style={{
            background: error ? '#DC2626' : success ? '#16A34A' : '#1E3A5F',
            color: '#ffffff',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 700,
            fontSize: 'clamp(13px, 3.5vw, 15px)',
            letterSpacing: '0.03em',
            padding: '14px 18px',
            borderRadius: '12px',
            minHeight: '52px',
            minWidth: 'clamp(120px, 38vw, 160px)',
            boxShadow: '0 4px 14px rgba(30, 58, 95, 0.28), 0 1px 3px rgba(30, 58, 95, 0.12)',
            cursor: adding ? 'wait' : 'pointer',
            border: 'none',
          }}
          onMouseEnter={(e) => { if (!adding && !success && !error) (e.currentTarget as HTMLButtonElement).style.background = '#152C48'; }}
          onMouseLeave={(e) => { if (!adding && !success && !error) (e.currentTarget as HTMLButtonElement).style.background = '#1E3A5F'; }}
          aria-label={error ? error : undefined}
          title={error || undefined}
        >
          {error ? (
            <>
              <svg style={{ width: '18px', height: '18px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>Błąd — spróbuj ponownie</span>
            </>
          ) : success ? (
            <>
              <svg style={{ width: '18px', height: '18px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Dodano</span>
            </>
          ) : adding ? (
            <span>Dodaję…</span>
          ) : (
            <>
              <span>Kup teraz</span>
              <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
