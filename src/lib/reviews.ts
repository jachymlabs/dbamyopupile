/**
 * Per-product reviews helper.
 * Reads src/data/reviews.json and exposes typed accessors.
 *
 * Każdy produkt może mieć osobne opinie — keyed by slug.
 * Jeśli slug nie ma wpisu w JSON → zwracamy null i komponent pokazuje empty state.
 */
import reviewsData from '@/data/reviews.json';

export interface ReviewItem {
  name: string;
  age?: number;
  tag?: string;
  stars: 1 | 2 | 3 | 4 | 5;
  title?: string;
  body: string;
  verified: boolean;
  date: string; // DD.MM.YYYY
}

export interface ProductReviews {
  averageRating: number;
  totalCount: number;
  distribution: { 5: number; 4: number; 3: number; 2: number; 1: number };
  items: ReviewItem[];
}

const data = reviewsData as Record<string, ProductReviews | { description?: string }>;

/**
 * Get reviews for a product slug.
 * Returns null if no reviews defined.
 */
export function getProductReviews(slug: string): ProductReviews | null {
  const entry = data[slug];
  if (!entry || !('averageRating' in entry)) return null;
  return entry as ProductReviews;
}

/**
 * Format Polish-locale decimal — 4.72 → "4,72".
 */
export function formatRating(n: number): string {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Compute percentages per star (0-100) from distribution + total.
 */
export function ratingPercentages(reviews: ProductReviews): Record<1 | 2 | 3 | 4 | 5, number> {
  const total = reviews.totalCount || 1;
  return {
    5: Math.round((reviews.distribution[5] / total) * 100),
    4: Math.round((reviews.distribution[4] / total) * 100),
    3: Math.round((reviews.distribution[3] / total) * 100),
    2: Math.round((reviews.distribution[2] / total) * 100),
    1: Math.round((reviews.distribution[1] / total) * 100),
  };
}

/**
 * Polish plural for "opinii / opinia / opinie" (Slavic genitive cases).
 */
export function opiniiPlural(count: number): string {
  if (count === 1) return 'opinia';
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 12 && lastTwo <= 14) return 'opinii';
  if (last >= 2 && last <= 4) return 'opinie';
  return 'opinii';
}

/**
 * Helper — kind of star to render for position i (1-5) given rating decimal.
 * Returns 'full' | 'half' | 'empty'.
 */
export function starKind(i: number, rating: number): 'full' | 'half' | 'empty' {
  if (i <= Math.floor(rating)) return 'full';
  if (i - 0.5 <= rating) return 'half';
  return 'empty';
}
