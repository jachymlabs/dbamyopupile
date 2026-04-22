// ── Section system types ──

export interface BaseSectionProps {
  id?: string;
  theme?: 'light' | 'dark' | 'brand' | 'accent';
  paddingY?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}

// ── Individual section props ──

export interface HeroProps extends BaseSectionProps {
  badge?: string;
  headline: string;
  subheadline?: string;
  features?: string[];
  rating?: number;
  reviewCount?: number;
  imageUrl?: string;
  mobileImageUrl?: string;
  primaryCtaLabel?: string;
  primaryCtaUrl?: string;
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string;
}

export interface FeaturesGridProps extends BaseSectionProps {
  headline?: string;
  features: { icon: string; title: string; description: string }[];
  columns?: 2 | 3 | 4;
}

export interface TestimonialQuoteProps extends BaseSectionProps {
  quote: string;
  authorName: string;
  authorTitle?: string;
  rating?: number;
  avatarUrl?: string;
}

export interface BeforeAfterProps extends BaseSectionProps {
  headline: string;
  beforeImageUrl: string;
  beforeLabel?: string;
  afterImageUrl: string;
  afterLabel?: string;
  description?: string;
  authorName?: string;
  authorTitle?: string;
}

export interface FaqAccordionProps extends BaseSectionProps {
  headline?: string;
  items: { question: string; answer: string }[];
}

export interface ComparisonTableProps extends BaseSectionProps {
  headline?: string;
  ourBrand: string;
  competitor: string;
  rows: { feature: string; us: boolean; them: boolean }[];
}

export interface StatsBarProps extends BaseSectionProps {
  stats: { value: string; label: string }[];
}

export interface ReviewsCarouselProps extends BaseSectionProps {
  headline?: string;
  reviews: { title?: string; body: string; author: string; rating: number }[];
}

export interface BrandStoryProps extends BaseSectionProps {
  headline: string;
  bodyHtml: string;
  imageUrl?: string;
  imageAlignment?: 'left' | 'right';
}

export interface CustomHtmlProps extends BaseSectionProps {
  htmlContent: string;
}

// ── Discriminated union ──

export type PageSection =
  | { type: 'hero'; props: HeroProps }
  | { type: 'features-grid'; props: FeaturesGridProps }
  | { type: 'testimonial-quote'; props: TestimonialQuoteProps }
  | { type: 'before-after'; props: BeforeAfterProps }
  | { type: 'faq-accordion'; props: FaqAccordionProps }
  | { type: 'comparison-table'; props: ComparisonTableProps }
  | { type: 'stats-bar'; props: StatsBarProps }
  | { type: 'reviews-carousel'; props: ReviewsCarouselProps }
  | { type: 'brand-story'; props: BrandStoryProps }
  | { type: 'custom-html'; props: CustomHtmlProps };
