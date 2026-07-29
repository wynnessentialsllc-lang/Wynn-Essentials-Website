// Customer reviews shown in each product's detail modal (the "Customer Reviews"
// section). These appear on the live storefront, so every entry must be a
// genuine Wynn Essentials customer review — do not invent reviews or reuse
// another brand's testimonials. Leave the list empty for a product that has no
// reviews yet; the modal falls back to a "Be the first to review" message.
//
// To add a review, copy the shape below. `productSlug` must match a `slug` in
// app/data.ts. `rating` is a whole number 1–5. `verified` marks a confirmed
// purchase ("Verified buyer" badge). `date` is the review date as YYYY-MM-DD;
// omit it when the date is unknown and the card simply hides the timestamp.
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
  // Reviewer display name, e.g. "Ashley M.", a first name, or an @handle.
  author: string;
  // Optional location or descriptor shown next to the name, e.g. "California".
  location?: string;
  // Whole-number star rating, 1–5.
  rating: number;
  // Optional short headline shown above the review body.
  title?: string;
  // The review text.
  body: string;
  // True for a confirmed purchase — renders the "Verified buyer" badge.
  verified?: boolean;
  // Review date as an ISO calendar date, e.g. "2026-07-20". Omit when unknown.
  date?: string;
};

// Genuine Wynn Essentials customer reviews, migrated from the brand's Square
// site ("What customers are loving about Wynn Essentials") and the
// @wynnessentials Instagram customer-review posts. Dates are set where the
// original post date is known and omitted otherwise. Do not add invented
// reviews — see the header note.
export const reviews: Review[] = [
  // Edge Control
  { id: "edge-armani-f", productSlug: "edge-control", author: "Armani F.", rating: 5, verified: true, title: "AMAZING!", body: "I have 4C hair and it gets the job done!" },
  { id: "edge-aziza", productSlug: "edge-control", author: "Aziza", location: "California", rating: 5, verified: true, date: "2023-12-28", body: "I have tried every edge control on the market (I have literally tried them all) and this edge control is the best. The edge control deserves five stars!" },
  { id: "edge-q-mitchell", productSlug: "edge-control", author: "Q. Mitchell", rating: 5, verified: true, date: "2021-11-15", body: "My edges are growing back thanks to Wynn Essentials Edge Control and Wynn Essentials Nourish. Thank you!" },
  // Nourish
  { id: "nourish-tameradavis", productSlug: "nourish-oil", author: "@tameradavis", rating: 4, verified: true, body: "Worth every penny!" },
  { id: "nourish-flying-lanesy", productSlug: "nourish-oil", author: "@flying_lanesy", rating: 5, verified: true, body: "Transformed my hair. Highly recommend." },
  { id: "nourish-cool-james", productSlug: "nourish-oil", author: "@cool_james", rating: 4, verified: true, body: "Run, don’t walk! Best product on the market. I’m on my second bottle." },
  // Hydrate
  { id: "hydrate-tiffany-r", productSlug: "hydrate-herbal-hair-mist", author: "Tiffany R.", rating: 5, verified: true, body: "Love how it smells! I use it everyday." },
  { id: "hydrate-stephanie-t", productSlug: "hydrate-herbal-hair-mist", author: "Stephanie T.", rating: 5, verified: true, date: "2024-02-01", body: "I love using Hydrate. There is no sticky residue after applying so I can use this daily without the product buildup." },
  // Revaivl
  { id: "revaivl-alexandria-d", productSlug: "revaivl-protein-conditioner", author: "Alexandria D.", rating: 5, verified: true, body: "Smells like Georgia Peaches!" },
  { id: "revaivl-nadia-m", productSlug: "revaivl-protein-conditioner", author: "Nadia M.", rating: 5, verified: true, body: "Love the way it makes my hair feel." },
  // Grow
  { id: "grow-chanda", productSlug: "grow-oil", author: "Chanda", rating: 5, verified: true, body: "Growing out a pixie is not easy but this formula paired with my braids is getting the job done." },
  // Relief
  { id: "relief-stacey-a", productSlug: "relief-oil", author: "Stacey A.", rating: 5, verified: true, date: "2024-01-04", body: "Absolutely love this product. It’s so lightweight, non-sticky, and doesn’t make my skin break out or become greasy. I have sensitive skin so this has been a game changer!" },
  // Body Wave (boho human hair)
  { id: "bodywave-jessica-hale", productSlug: "boho-body-wave-18", author: "Jessica Hale", location: "Scottsdale, Arizona", rating: 5, verified: true, date: "2024-01-16", body: "They have some of the best human hair for boho braids! I’ve had my Body Wave hair installed twice and I always get compliments on how pretty it is." },
];

export type ReviewSummary = {
  count: number;
  // Mean rating across all reviews, rounded to one decimal (e.g. 4.9).
  average: number;
  // Whole percentage of reviews at each star level, keyed 1–5. Always sums to
  // ~100 across the five buckets (rounding may leave it at 99 or 101).
  distribution: Record<number, number>;
};

// All reviews for a product: dated reviews newest first, then any undated ones
// in their listed order.
export function reviewsFor(slug: string): Review[] {
  return reviews
    .filter((r) => r.productSlug === slug)
    .sort((a, b) => {
      if (a.date && b.date) return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });
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
