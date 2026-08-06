import { pgTable, text, bigint, bigserial, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

// Every Stripe event we have already accepted. Written before an order is
// recorded so a redelivered event can never create a second order.
export const stripeEvents = pgTable("stripe_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  sessionId: text("session_id"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

// Amounts are stored in the currency's minor unit (cents), exactly as Stripe
// reports them, so no rounding is introduced between Stripe and our records.
export const orders = pgTable("orders", {
  sessionId: text("session_id").primaryKey(),
  orderReference: text("order_reference"),
  eventId: text("event_id").notNull(),
  paymentIntentId: text("payment_intent_id"),
  status: text("status").notNull(),
  paymentStatus: text("payment_status"),
  currency: text("currency"),
  subtotalAmount: bigint("subtotal_amount", { mode: "number" }),
  discountAmount: bigint("discount_amount", { mode: "number" }),
  shippingAmount: bigint("shipping_amount", { mode: "number" }),
  taxAmount: bigint("tax_amount", { mode: "number" }),
  totalAmount: bigint("total_amount", { mode: "number" }),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  shippingAddress: jsonb("shipping_address"),
  items: jsonb("items").notNull(),
  fulfillmentStatus: text("fulfillment_status").notNull().default("unfulfilled"),
  // Shipping details captured in /admin/orders when an order is marked shipped.
  // Setting a tracking number is what triggers the customer shipping email.
  trackingNumber: text("tracking_number"),
  carrier: text("carrier"),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  // Set by the review-requests cron once the post-purchase review email has been
  // sent, so each customer is asked at most once.
  reviewRequestedAt: timestamp("review_requested_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Order = typeof orders.$inferSelect;

// Newsletter ("The Wynn Edit") signups. Holds contact PII (email, phone), so it
// is locked to server-side access by 0002_restrict_subscribers.sql, exactly like
// the order tables. Email is the primary key so a repeat signup updates in place
// instead of creating a duplicate.
export const subscribers = pgTable("subscribers", {
  email: text("email").primaryKey(),
  phone: text("phone"),
  marketingConsent: boolean("marketing_consent").notNull().default(false),
  consentText: text("consent_text"),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
});

export type Subscriber = typeof subscribers.$inferSelect;

// Live sold-out overrides, managed in /admin/inventory. A row with sold_out=true
// hides a product's Add to Cart and blocks its checkout, without a code change.
export const productInventory = pgTable("product_inventory", {
  slug: text("slug").primaryKey(),
  soldOut: boolean("sold_out").notNull().default(false),
  // Units in stock. null = not tracked (treated as unlimited). When tracked and
  // <= 0 the product is sold out. Decremented on each paid order.
  stock: integer("stock"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ProductInventory = typeof productInventory.$inferSelect;

// Customer support / contact messages submitted from the storefront. Holds
// contact PII (name, email), so it is locked to server-side access by
// 0006_support_messages.sql, exactly like the order and subscriber tables.
export const supportMessages = pgTable("support_messages", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  // Optional order reference so an order question can be tied to a purchase.
  orderNumber: text("order_number"),
  topic: text("topic"),
  message: text("message").notNull(),
  // "new" until an admin marks it "resolved" in /admin/support.
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type SupportMessage = typeof supportMessages.$inferSelect;

// Customer product reviews submitted from the storefront "Write a Review" form.
// Holds contact PII (email) used only for moderation and buyer verification and
// never shown publicly, so it is locked to server-side access with the same RLS
// posture as the order, subscriber, and support tables (0007_product_reviews.sql).
// A review is "pending" until an admin approves it in /admin/reviews; only
// "approved" rows are served to the public storefront. `verified` is set at
// submission time when the reviewer's email matches a paid order.
export const productReviews = pgTable("product_reviews", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  // Matches a Product.slug in app/data.ts.
  productSlug: text("product_slug").notNull(),
  // Public display name for the reviewer.
  author: text("author").notNull(),
  // Optional location or descriptor shown next to the name.
  location: text("location"),
  rating: integer("rating").notNull(),
  title: text("title"),
  body: text("body").notNull(),
  // Contact email — used to verify a purchase and follow up; never public.
  email: text("email").notNull(),
  verified: boolean("verified").notNull().default(false),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ProductReview = typeof productReviews.$inferSelect;

// First-party, no-PII visitor events for the traffic dashboard. `visitorId` is a
// random id from a first-party cookie/localStorage — no name, no cross-site
// tracking. Public storefront writes here, so no RLS lockdown.
// Abandoned-cart snapshots. Written when a shopper who has given an email starts
// checkout; a scheduled job emails a reminder if no matching paid order appears.
// Holds an email (PII), so it is locked to server-side access like the order and
// subscriber tables. Keyed by email so a shopper has one live snapshot.
export const abandonedCarts = pgTable("abandoned_carts", {
  email: text("email").primaryKey(),
  visitorId: text("visitor_id"),
  items: jsonb("items").notNull(),
  subtotal: bigint("subtotal", { mode: "number" }),
  // "pending" until emailed; "emailed" after a reminder is sent; "recovered"
  // once a paid order from this email is seen.
  status: text("status").notNull().default("pending"),
  emailedAt: timestamp("emailed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type AbandonedCart = typeof abandonedCarts.$inferSelect;

// Education-hub / blog posts, managed in /admin/blog. Body is Markdown, rendered
// server-side. Only "published" posts are shown publicly. No PII, but writes are
// server/admin-only, so it carries the same RLS posture as the other tables.
export const blogPosts = pgTable("blog_posts", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  excerpt: text("excerpt"),
  body: text("body").notNull(),
  coverImage: text("cover_image"),
  author: text("author").notNull().default("Wynn Essentials"),
  status: text("status").notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type BlogPost = typeof blogPosts.$inferSelect;

export const events = pgTable("events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  visitorId: text("visitor_id").notNull(),
  type: text("type").notNull(),
  path: text("path"),
  productSlug: text("product_slug"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Event = typeof events.$inferSelect;
