import { setCartState } from './cart-store';

async function cartFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error('Cart API error');
  return res.json();
}

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
    setCartState({ loading: false, error: null });
  }
}

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
    setCartState({ loading: false, error: null });
  }
}

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
    setCartState({ loading: false, error: null });
  }
}

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
    setCartState({ loading: false, error: null });
  }
}
