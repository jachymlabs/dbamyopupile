import { setCartState } from './cart-store';

const NETWORK_ERROR_MSG = 'Połączenie nieudane. Sprawdź internet i spróbuj ponownie.';

async function cartFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    // H6 (Sprint 2): use 'include' (not 'same-origin') so the vendure-auth-token
    // cookie is reliably sent in Safari + ITP contexts even if PUBLIC_COOKIE_DOMAIN
    // ever puts the storefront and API on different subdomains. Endpoints stay
    // CSRF-protected via Origin check + SameSite=Lax cookie.
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Cart API error');
  return res.json();
}

/** GET /api/cart — silent error, fetch przy mount nie powinien straszyc usera */
export async function fetchCart(): Promise<void> {
  setCartState({ loading: true, error: null });
  try {
    const data = await cartFetch('/api/cart');
    if (data.error) {
      setCartState({ loading: false, error: data.error });
      return;
    }
    setCartState({ order: data.order, loading: false, error: null });
  } catch {
    // Cichy fail przy initial fetch - drawer pokaze "pusty koszyk" zamiast bledu.
    // To OK bo user nie wykonał żadnej akcji której wynik czeka.
    setCartState({ loading: false, error: null });
  }
}

/** POST /api/cart — user-initiated, MUSI komunikowac blad sieciowy */
export async function addToCart(variantId: string, quantity: number = 1): Promise<void> {
  setCartState({ loading: true, error: null });
  try {
    const data = await cartFetch('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ variantId, quantity }),
    });
    if (data.error) {
      setCartState({ loading: false, error: data.error });
      return;
    }
    setCartState({ order: data.order, loading: false, isOpen: true, error: null });
  } catch {
    // M14: previously zjadało blad (`error: null`) - user widział loading off
    // i myslał ze poszlo OK. Teraz pokazujemy konkretny komunikat.
    setCartState({ loading: false, error: NETWORK_ERROR_MSG });
  }
}

/** POST /api/cart/adjust — user changed qty, MUSI komunikowac blad */
export async function adjustCartItem(lineId: string, quantity: number): Promise<void> {
  setCartState({ loading: true, error: null });
  try {
    const data = await cartFetch('/api/cart/adjust', {
      method: 'POST',
      body: JSON.stringify({ lineId, quantity }),
    });
    if (data.error) {
      setCartState({ loading: false, error: data.error });
      return;
    }
    setCartState({ order: data.order, loading: false, error: null });
  } catch {
    setCartState({ loading: false, error: NETWORK_ERROR_MSG });
  }
}

/** POST /api/cart/remove — user-initiated, MUSI komunikowac blad */
export async function removeFromCart(lineId: string): Promise<void> {
  setCartState({ loading: true, error: null });
  try {
    const data = await cartFetch('/api/cart/remove', {
      method: 'POST',
      body: JSON.stringify({ lineId }),
    });
    if (data.error) {
      setCartState({ loading: false, error: data.error });
      return;
    }
    setCartState({ order: data.order, loading: false, error: null });
  } catch {
    setCartState({ loading: false, error: NETWORK_ERROR_MSG });
  }
}
