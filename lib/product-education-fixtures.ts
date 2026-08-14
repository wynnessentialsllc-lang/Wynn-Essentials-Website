// Sample orders for previewing and testing the product-education email.
//
// None of these are read at runtime — they exist so the message can be rendered
// and asserted on without touching Stripe, the database, or a real customer.
// Each one is a shape the cron will genuinely meet:
//
//   single        the ordinary case — one product, one section.
//   wash-day      three products that belong to the same routine, which is what
//                 the Wynn Method ordering is for.
//   bundle        the Hair Wellness Bundle, which must expand into its four
//                 products rather than render as one vague section.
//   accessories   a product with no mailable (JPEG/PNG) photograph and one with
//                 no `size`, so the renderer is proven to survive both.
//   everything    every product in the catalog at once — the worst case for the
//                 ~102KB Gmail clipping limit.

import { products } from "../app/data";

export type EducationFixture = {
  key: string;
  description: string;
  email: string;
  customerName: string | null;
  orderReference: string | null;
  /** Stripe product ids, exactly as an order's line items store them. */
  items: { productId: string | null }[];
};

/** Line items for the given catalog slugs, in the order a customer bought them. */
const itemsFor = (...slugs: string[]) => slugs.map(slug => ({
  productId: products.find(p => p.slug === slug)?.stripeProductId ?? null,
}));

export const educationFixtures: EducationFixture[] = [
  {
    key: "single",
    description: "One product — the most common order",
    email: "customer@example.com",
    customerName: "Alicia Moore",
    orderReference: "WE-1042",
    items: itemsFor("hydrate-herbal-hair-mist"),
  },
  {
    key: "wash-day",
    description: "Three products bought out of routine order, emailed in it",
    email: "customer@example.com",
    customerName: "Danielle",
    orderReference: "WE-1043",
    // Deliberately reversed: seal, then cleanse, then condition. The email must
    // still read Lathyr → Uplyft → Nourish.
    items: itemsFor("nourish-oil", "lathyr-shampoo", "uplyft-conditioner"),
  },
  {
    key: "bundle",
    description: "The Hair Wellness Bundle, expanded into its four products",
    email: "customer@example.com",
    customerName: null,
    orderReference: "WE-1044",
    items: itemsFor("hair-wellness-bundle"),
  },
  {
    key: "accessories",
    description: "A bonnet and a scrunchie set — no mailable photo, no size on one",
    email: "customer@example.com",
    customerName: "Rae",
    orderReference: null,
    items: itemsFor("soft-life-bonnet", "heritage-hold-scrunchie-set"),
  },
  {
    key: "everything",
    description: "Every catalog product at once — the worst case for message size",
    email: "customer@example.com",
    customerName: "Jordan Ellis",
    orderReference: "WE-1045",
    items: products.map(p => ({ productId: p.stripeProductId ?? null })),
  },
];
