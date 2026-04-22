import { useCartStore, openCart } from '../lib/cart-store';

interface Props {
  initialQuantity?: number;
}

export default function CartBadge({ initialQuantity = 0 }: Props) {
  const { order } = useCartStore();
  const quantity = order?.totalQuantity ?? initialQuantity;

  // CartDrawer already fetches cart on mount — no need to double-fetch here.
  // CartBadge just subscribes to the shared store.

  return (
    <button
      type="button"
      onClick={openCart}
      className="relative flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors min-w-[44px] min-h-[44px] justify-center"
      aria-label={`Koszyk${quantity > 0 ? `, ${quantity} produktów` : ''}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        />
      </svg>
      <span className="hidden sm:inline">Koszyk</span>
      {quantity > 0 && (
        <span aria-live="polite" className="absolute -top-1 -right-1 sm:-top-2 sm:-right-4 bg-gray-900 text-white text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full leading-none">
          {quantity > 99 ? '99+' : quantity}
        </span>
      )}
    </button>
  );
}
