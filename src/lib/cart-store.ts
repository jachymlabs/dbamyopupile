import { useState, useEffect } from 'react';

export type CartLine = {
  id: string;
  quantity: number;
  unitPriceWithTax: number;
  linePriceWithTax: number;
  productVariant: {
    id: string;
    name: string;
    product: {
      id: string;
      name: string;
      slug: string;
      featuredAsset?: { id: string; preview: string };
    };
  };
};

export type CartOrder = {
  id: string;
  totalQuantity: number;
  subTotalWithTax: number;
  totalWithTax: number;
  shippingWithTax: number;
  currencyCode: string;
  lines: CartLine[];
  discounts: { description: string; amountWithTax: number }[];
};

export type CartState = {
  isOpen: boolean;
  order: CartOrder | null;
  loading: boolean;
  error: string | null;
};

let state: CartState = { isOpen: false, order: null, loading: false, error: null };
const listeners = new Set<() => void>();

export function getCartState(): CartState {
  return state;
}

export function setCartState(partial: Partial<CartState>): void {
  state = { ...state, ...partial };
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openCart(): void {
  setCartState({ isOpen: true });
}

export function closeCart(): void {
  setCartState({ isOpen: false });
}

export function toggleCart(): void {
  setCartState({ isOpen: !state.isOpen });
}

/** React hook — subscribes to cart state changes and re-renders. */
export function useCartStore(): CartState {
  const [, forceUpdate] = useState(0);
  useEffect(() => subscribe(() => forceUpdate((n) => n + 1)), []);
  return getCartState();
}
