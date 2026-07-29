// Customer reviews shown in each product's detail modal (the "Customer Reviews"
// section). These appear on the live storefront, so every entry must be a
// genuine Wynn Essentials customer review — do not invent reviews or reuse
// another brand's testimonials. Leave the list empty for a product that has no
// reviews yet; the modal falls back to a "Be the first to review" message.
//
// To add a review, copy the shape below. `productSlug` must match a `slug` in
// app/data.ts. `rating` is a whole number 1–5. `verified` marks a confirmed
// purchase ("Verified buyer" badge). `date` is the review date as YYYY-MM-DD.
//
//   {
//     id: "hydrate-ashley-m",
//     productSlug: "hydrate-herbal-hair-mist",
//     author: "Ashley M.",
//     rating: 5,
//     verified: true,
//     date: "2026-07-20",
//     body: "My hair has never felt so soft and moisturized.",
//   },

export type Review = {
  // Stable unique id, used as the React key.
  id: string;
  // Matches Product.slug in app/data.ts.
  productSlug: string;
  // Reviewer display name, e.g. "Ashley M." or a first name.
  author: string;
  // Whole-number star rating, 1–5.
  rating: number;
  // Optional short headline shown above the review body.
  title?: string;
  // The review text.
  body: string;
  // True for a confirmed purchase — renders the "Verified buyer" badge.
  verified?: boolean;
  // Review date as an ISO calendar date, e.g. "2026-07-20".
  date: string;
};

// Add genuine customer reviews here. See the header comment for the shape.
export const reviews: Review[] = [];

export type ReviewSummary = {
  count: number;
  // Mean rating across all reviews, rounded to one decimal (e.g. 4.9).
  average: number;
  // Whole percentage of reviews at each star level, keyed 1–5. Always sums to
  // ~100 across the five buckets (rounding may leave it at 99 or 101).
  distribution: Record<number, number>;
};

// All reviews for a product, newest first.
export function reviewsFor(slug: string): Review[] {
  return reviews
    .filter((r) => r.productSlug === slug)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// Rolls a product's reviews into the numbers the summary panel needs.
export function summarize(list: Review[]): ReviewSummary {
  const count = list.length;
  if (!count) return { count: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  const total = list.reduce((sum, r) => sum + r.rating, 0);
  const average = Math.round((total / count) * 10) / 10;
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of list) {
    const star = Math.min(5, Math.max(1, Math.round(r.rating)));
    distribution[star] += 1;
  }
  for (let star = 1; star <= 5; star += 1) {
    distribution[star] = Math.round((distribution[star] / count) * 100);
  }
  return { count, average, distribution };
}

// Human-friendly relative time ("2 days ago") for recent dates, falling back to
// a plain calendar date for anything older than ~4 weeks. Returns the raw
// string if the date can't be parsed.
export function relativeDate(date: string, now: number = Date.now()): string {
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return date;
  const dayMs = 86_400_000;
  const days = Math.floor((now - then) / dayMs);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 28) return `${days} days ago`;
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
