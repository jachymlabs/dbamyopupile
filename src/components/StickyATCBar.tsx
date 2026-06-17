import { useState, useEffect, useRef } from "react";
import { addToCart } from "../lib/cart-api";
import { getCartState } from "../lib/cart-store";

interface Props {
  productName: string;
  price: number;
  variantId: string;
  currencyCode?: string;
  observeSelector?: string;
  scrollThreshold?: number;
  imageUrl?: string;
  compactName?: string;
  /** If true — click scrolls to variant selector instead of adding to cart */
  requiresVariantSelection?: boolean;
  /** Selector for the variant section to scroll to */
  variantSectionSelector?: string;
}

/**
 * dbamyopupile sticky ATC bar — sage primary CTA. Jeśli produkt ma warianty, klik
 * scrolluje do sekcji wyboru wariantu zamiast dodawać do koszyka.
 */
export default function StickyATCBar({
  productName,
  price,
  variantId,
  currencyCode = "PLN",
  observeSelector = "#primary-atc-btn",
  imageUrl,
  compactName,
  requiresVariantSelection = false,
  variantSectionSelector = "#variant-selector, .pdp-variant-picker, .pdp-options",
}: Props) {
  const [pastTrigger, setPastTrigger] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const [adding, setAdding] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundleQty, setBundleQty] = useState(1);
  const [overridePrice, setOverridePrice] = useState<string | null>(null);
  const primaryObsRef = useRef<IntersectionObserver | null>(null);
  const footerObsRef = useRef<IntersectionObserver | null>(null);

  // Bundle/qty support — listen to PDP form changes
  useEffect(() => {
    const onBundleChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        qty: number;
        priceText: string;
      };
      if (detail?.qty) setBundleQty(detail.qty);
      if (detail?.priceText) setOverridePrice(detail.priceText);
    };
    window.addEventListener("wm-bundle-change", onBundleChange);
    return () => window.removeEventListener("wm-bundle-change", onBundleChange);
  }, []);

  // Observe trigger (primary ATC) + footer — JEDNO źródło prawdy, flicker-free.
  //
  // Bug wcześniej: dwa warunki (scrollY > 1.5×viewport ORAZ IntersectionObserver
  // z 200px marginem) gryzły się przy wysokim hero (bundle Moodles) → bar
  // pojawiał się, znikał i znowu pojawiał. Teraz JEDEN IntersectionObserver na
  // przycisku ATC + check KIERUNKU (boundingClientRect.top < 0 = element nad
  // viewportem). Bar pokazuje się TYLKO gdy user przewinął ATC w GÓRĘ poza ekran
  // (= przeszedł cały konfigurator produktu / hero). Zero scroll-math, zero jitter.
  useEffect(() => {
    const timer = setTimeout(() => {
      const target = document.querySelector(observeSelector);
      if (target) {
        const obs = new IntersectionObserver(
          ([entry]) => {
            // top < 0 → element wyjechał ponad górną krawędź = przewinięty w górę.
            // !isIntersecting odróżnia "nad viewportem" od "wewnątrz".
            const passedUp = !entry.isIntersecting && entry.boundingClientRect.top < 0;
            setPastTrigger(passedUp);
          },
          { threshold: 0 },
        );
        obs.observe(target);
        primaryObsRef.current = obs;
      }

      // Footer — hide sticky when footer enters viewport
      const footer = document.querySelector(
        ".dd-footer, .dd-footer-light, footer, [data-site-footer]",
      );
      if (footer) {
        const fobs = new IntersectionObserver(
          ([entry]) => setFooterVisible(entry.isIntersecting),
          { threshold: 0, rootMargin: "0px 0px -40px 0px" },
        );
        fobs.observe(footer);
        footerObsRef.current = fobs;
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      primaryObsRef.current?.disconnect();
      footerObsRef.current?.disconnect();
    };
  }, [observeSelector]);

  // Final visibility: bar shows when scrolled past trigger AND footer not visible.
  const visible = pastTrigger && !footerVisible;

  const handleAdd = async () => {
    // Produkt z wariantami — przewiń do sekcji wyboru zamiast dodawać.
    if (requiresVariantSelection) {
      const target = document.querySelector(
        variantSectionSelector,
      ) as HTMLElement | null;
      if (target) {
        const rect = target.getBoundingClientRect();
        const offset = window.innerHeight * 0.18; // trochę headroom nad sekcją
        window.scrollTo({
          top: window.scrollY + rect.top - offset,
          behavior: "smooth",
        });
        target.classList.add("pdp-variant-flash");
        setTimeout(() => target.classList.remove("pdp-variant-flash"), 1400);
      }
      return;
    }

    setAdding(true);
    setError(null);
    await addToCart(variantId, bundleQty);
    setAdding(false);
    const cartErr = getCartState().error;
    if (cartErr) {
      setError(cartErr);
      setTimeout(() => setError(null), 4000);
      return;
    }
    setSuccess(true);

    // Behawioralny pixel — add_to_cart (Warstwa 1, ZERO Meta). Fail-safe:
    // optional chaining, nigdy nie blokuje akcji koszyka.
    const sp = (window as { sp?: { track?: (t: string, d: unknown) => void } })
      .sp;
    sp?.track?.("add_to_cart", {
      product_id: variantId,
      value: (price * bundleQty) / 100,
      currency: currencyCode,
    });

    setTimeout(() => setSuccess(false), 1800);
  };

  const formattedPrice =
    overridePrice ||
    new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency: currencyCode,
    }).format(price / 100);

  const displayName = compactName || productName;

  return (
    <div
      className={`dop-sticky-atc fixed left-0 right-0 z-40 transition-transform duration-300 ease-out ${visible ? "translate-y-0" : "translate-y-full"}`}
      style={{
        // Mobile iOS Safari nie tankuje blur(20px) saturate(180%) podczas scrolla —
        // jankuje cały viewport. Tutaj solid background na mobile (klasa CSS niżej).
        // box-shadow i border-top TYLKO gdy visible — inaczej shadow -8px 32px wystaje
        // 24px w górę od translateY(100%)-skrytego bara, dając widoczny cień przy
        // dolnej krawędzi viewportu (bug: "cień na dole na pierwszej wizycie").
        paddingBottom: "env(safe-area-inset-bottom)",
        borderTop: visible ? "1px solid #E5DFD2" : "none",
        boxShadow: visible
          ? "0 -8px 32px rgba(42, 45, 39, 0.10), 0 -2px 6px rgba(42, 45, 39, 0.05)"
          : "none",
        willChange: "transform",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4">
        {imageUrl && (
          <div
            className="shrink-0 rounded-xl overflow-hidden"
            style={{
              width: "52px",
              height: "52px",
              border: "1px solid #E5DFD2",
              background: "#EFE9DD",
            }}
          >
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-cover"
              style={{ objectPosition: "center 40%" }}
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p
            className="truncate"
            style={{
              color: "#8A8E84",
              fontFamily: "Outfit, system-ui, sans-serif",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.06em",
              lineHeight: 1.2,
            }}
          >
            {displayName}
          </p>
          <p
            className="leading-none mt-1"
            style={{
              color: "#2A2D27",
              fontFamily: "Outfit, system-ui, sans-serif",
              fontWeight: 800,
              fontSize: "clamp(18px, 4.5vw, 22px)",
              letterSpacing: "-0.02em",
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
            background: error ? "#C8202E" : success ? "#5C7BA0" : "#7497BF",
            color: "#FFFFFF",
            fontFamily: "Outfit, system-ui, sans-serif",
            fontWeight: 800,
            fontSize: "clamp(12px, 3vw, 14px)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            padding: "14px 22px",
            borderRadius: "9999px",
            minHeight: "52px",
            minWidth: "clamp(120px, 38vw, 168px)",
            boxShadow:
              error || success
                ? "none"
                : "0 6px 20px rgba(116, 151, 191, 0.30), 0 2px 4px rgba(116, 151, 191, 0.15)",
            cursor: adding ? "wait" : "pointer",
            border: "none",
            transition:
              "transform 200ms ease, box-shadow 200ms ease, background 200ms ease",
          }}
          onMouseEnter={(e) => {
            if (!adding && !success && !error) {
              (e.currentTarget as HTMLButtonElement).style.background =
                "#5C7BA0";
              (e.currentTarget as HTMLButtonElement).style.transform =
                "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            if (!adding && !success && !error) {
              (e.currentTarget as HTMLButtonElement).style.background =
                "#7497BF";
              (e.currentTarget as HTMLButtonElement).style.transform =
                "translateY(0)";
            }
          }}
          aria-label={
            error
              ? error
              : requiresVariantSelection
                ? "Wybierz wariant"
                : undefined
          }
          title={
            error || (requiresVariantSelection ? "Wybierz wariant" : undefined)
          }
        >
          {error ? (
            <>
              <svg
                style={{ width: "18px", height: "18px" }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>Błąd</span>
            </>
          ) : success ? (
            <>
              <svg
                style={{ width: "18px", height: "18px" }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Dodano</span>
            </>
          ) : adding ? (
            <span>Dodaję…</span>
          ) : requiresVariantSelection ? (
            <>
              <span>Wybierz wariant</span>
              <svg
                style={{ width: "18px", height: "18px" }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
            </>
          ) : (
            <>
              <span>Do koszyka</span>
              <svg
                style={{ width: "18px", height: "18px" }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
