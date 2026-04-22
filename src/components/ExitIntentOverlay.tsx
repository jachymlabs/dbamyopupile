import { useState, useEffect, useRef, useCallback } from 'react';
import { getFreeShippingThreshold } from '../lib/constants';
import { lockScroll, unlockScroll } from '../lib/scroll-lock';
import { useFocusTrap } from '../lib/use-focus-trap';

const STORAGE_KEY = 'exit-intent-dismissed';
const DISMISS_DAYS = 14;
const MIN_TIME_ON_PAGE_MS = 10_000;
const SCROLL_VELOCITY_THRESHOLD = 500; // px
const SCROLL_VELOCITY_WINDOW_MS = 300; // ms

// Pages where overlay should NOT appear
const BLOCKED_PATHS = ['/checkout', '/potwierdzenie'];

function isBlocked(): boolean {
  return BLOCKED_PATHS.some((p) => window.location.pathname.startsWith(p));
}

function isDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    const daysSince = (Date.now() - ts) / (1000 * 60 * 60 * 24);
    return daysSince < DISMISS_DAYS;
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  } catch {
    // localStorage unavailable
  }
}

export default function ExitIntentOverlay() {
  const [visible, setVisible] = useState(false);
  const shownRef = useRef(false);
  const mountTimeRef = useRef(Date.now());
  const lastScrollYRef = useRef(0);
  const lastScrollTimeRef = useRef(0);

  const canShow = useCallback(() => {
    if (shownRef.current) return false;
    if (isBlocked()) return false;
    if (isDismissedRecently()) return false;
    if (Date.now() - mountTimeRef.current < MIN_TIME_ON_PAGE_MS) return false;
    return true;
  }, []);

  const show = useCallback(() => {
    if (!canShow()) return;
    shownRef.current = true;
    setVisible(true);
    lockScroll();
  }, [canShow]);

  const close = useCallback((permanent: boolean) => {
    setVisible(false);
    unlockScroll();
    if (permanent) {
      markDismissed();
    }
  }, []);

  // Focus trap
  const trapRef = useFocusTrap(visible);

  useEffect(() => {
    if (isBlocked() || isDismissedRecently()) return;

    // 1. Visibility API — tab hidden then visible
    let wasHidden = false;
    const handleVisibility = () => {
      if (document.hidden) {
        wasHidden = true;
      } else if (wasHidden) {
        wasHidden = false;
        show();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Back-button hijacking removed — aggressive UX pattern that frustrates users
    // and may be flagged by Google. Visibility API + scroll velocity are sufficient.

    // 2. Scroll velocity — rapid upward scroll
    lastScrollYRef.current = window.scrollY;
    lastScrollTimeRef.current = Date.now();

    const handleScroll = () => {
      const now = Date.now();
      const currentY = window.scrollY;
      const dt = now - lastScrollTimeRef.current;
      const dy = lastScrollYRef.current - currentY; // positive = scrolling up

      if (dt > 0 && dt < SCROLL_VELOCITY_WINDOW_MS && dy > SCROLL_VELOCITY_THRESHOLD) {
        show();
      }

      lastScrollYRef.current = currentY;
      lastScrollTimeRef.current = now;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [show]);

  // Escape key
  useEffect(() => {
    if (!visible) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [visible, close]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Oferta specjalna"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-fadeIn"
        onClick={() => close(false)}
        aria-hidden="true"
      />

      {/* Card */}
      <div ref={trapRef} className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 shadow-2xl animate-slideUp">
        {/* X button */}
        <button
          type="button"
          onClick={() => close(false)}
          className="absolute top-3 right-3 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors"
          aria-label="Zamknij"
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

        <div className="text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            Chwileczke! Mamy cos dla Ciebie
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Dokończ zakupy i skorzystaj z darmowej dostawy od {getFreeShippingThreshold() / 100} zl
          </p>

          <button
            type="button"
            onClick={() => close(false)}
            className="w-full rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition-colors min-h-[44px] mb-3"
          >
            Wróć do zakupów
          </button>

          <button
            type="button"
            onClick={() => close(true)}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors py-2"
          >
            Nie, dziekuje
          </button>
        </div>
      </div>

    </div>
  );
}
