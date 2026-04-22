// NOTE: This component is a UI placeholder. SMS subscription is saved to localStorage only.
// Connect to ESP (Omnisend/Klaviyo) API route before production launch.
import { useState, useEffect, useRef, useCallback } from 'react';
import { lockScroll, unlockScroll } from '../lib/scroll-lock';
import { useFocusTrap } from '../lib/use-focus-trap';

const STORAGE_KEY_SUBSCRIBED = 'sms-capture-subscribed';
const STORAGE_KEY_DISMISSED = 'sms-capture-dismissed';
const DISMISS_DAYS = 7;
const DELAY_MS = 30_000; // 30 seconds

// Only show on product pages
function isProductPage(): boolean {
  return window.location.pathname.startsWith('/produkty/');
}

function isDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DISMISSED);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    const daysSince = (Date.now() - ts) / (1000 * 60 * 60 * 24);
    return daysSince < DISMISS_DAYS;
  } catch {
    return false;
  }
}

function isAlreadySubscribed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_SUBSCRIBED) === 'true';
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY_DISMISSED, Date.now().toString());
  } catch {
    // localStorage unavailable
  }
}

function markSubscribed(): void {
  try {
    localStorage.setItem(STORAGE_KEY_SUBSCRIBED, 'true');
  } catch {
    // localStorage unavailable
  }
}

export default function SMSCaptureOverlay() {
  const [visible, setVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const shownRef = useRef(false);

  const close = useCallback((permanent: boolean) => {
    setVisible(false);
    unlockScroll();
    if (permanent) {
      markDismissed();
    }
  }, []);

  // Focus trap
  const trapRef = useFocusTrap(visible);

  // Show after delay on product pages
  useEffect(() => {
    if (!isProductPage() || isDismissedRecently() || isAlreadySubscribed()) return;

    const timer = setTimeout(() => {
      if (shownRef.current) return;
      shownRef.current = true;
      setVisible(true);
      lockScroll();
    }, DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  // Escape key
  useEffect(() => {
    if (!visible) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [visible, close]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Basic phone validation — Polish mobile: 9 digits or +48 prefix
    const cleaned = phone.replace(/[\s\-()]/g, '');
    const isValid = /^(\+48)?\d{9}$/.test(cleaned);
    if (!isValid) {
      setError('Podaj prawidlowy numer telefonu (9 cyfr)');
      return;
    }

    if (!consent) {
      setError('Wyrazenie zgody jest wymagane');
      return;
    }

    // TODO: Connect to backend (Vendure custom mutation or API route for SMS opt-in)
    // For now, just mark as subscribed locally — no data is sent to any backend.
    markSubscribed();
    setSubmitted(true);

    // Auto-close after 3 seconds
    setTimeout(() => {
      setVisible(false);
      unlockScroll();
    }, 3000);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Odbierz rabat SMS"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-smsFadeIn"
        onClick={() => close(false)}
        aria-hidden="true"
      />

      {/* Card — slide up on mobile, centered on desktop */}
      <div
        ref={trapRef}
        className="relative z-10 w-full sm:max-w-md bg-white sm:rounded-2xl rounded-t-2xl p-6 sm:p-8 shadow-2xl animate-smsSlideUp"
      >
        {/* X button */}
        <button
          type="button"
          onClick={() => close(true)}
          className="absolute top-3 right-3 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors"
          aria-label="Zamknij"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {submitted ? (
          /* Success state */
          <div className="text-center py-4">
            <div className="text-4xl mb-3">🎉</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Sprawdz swoj telefon!
            </h2>
            <p className="text-sm text-gray-600">
              Kod rabatowy jest w drodze
            </p>
          </div>
        ) : (
          /* Form state */
          <form onSubmit={handleSubmit} noValidate>
            <div className="text-center mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">
                Odbierz 10% rabatu
              </h2>
              <p className="text-sm text-gray-600">
                Podaj numer telefonu i otrzymaj kod rabatowy SMS-em
              </p>
            </div>

            {/* Phone input */}
            <div className="mb-4">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+48 ___ ___ ___"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent min-h-[48px]"
                autoComplete="tel"
              />
            </div>

            {/* RODO consent checkbox — REQUIRED */}
            <label className="flex items-start gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-gray-300 text-gray-900 focus:ring-gray-900 shrink-0"
              />
              <span className="text-xs text-gray-600 leading-relaxed">
                Wyrazam zgode na otrzymywanie komunikatow marketingowych SMS
              </span>
            </label>

            {/* RODO info text */}
            <p className="text-[10px] text-gray-400 mb-4 leading-relaxed">
              Administratorem danych jest [Nazwa Sklepu]. Mozesz zrezygnowac w kazdej chwili odpowiadajac STOP.
            </p>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-600 mb-3">{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="w-full rounded-lg bg-gray-900 text-white font-semibold py-3 text-sm hover:bg-gray-800 transition-colors min-h-[48px] mb-3"
            >
              Wyslij mi kod rabatowy
            </button>

            {/* Dismiss with 7-day cap */}
            <button
              type="button"
              onClick={() => close(true)}
              className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors py-2 text-center"
            >
              Nie, dziekuje
            </button>
          </form>
        )}
      </div>

    </div>
  );
}
