import { pgTable, text, bigint, timestamp, jsonb } from "drizzle-orm/pg-core";

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Order = typeof orders.$inferSelect;
