import type Stripe from "stripe";

export type OrderStatus = "paid" | "failed";

// Builds the orders-table row from a Stripe Checkout Session. Shared by the
// webhook (live events) and the reconcile cron (backfill of any session a
// webhook delivery missed) so both record byte-for-byte identical order data.
// Amounts stay in the currency's minor unit, exactly as Stripe reports them.
// The return type is left inferred (concrete) rather than annotated as the
// table's insert type, whose jsonb `items` widens to `unknown` and would not
// satisfy the notify helpers.
export function orderRowFromSession(
  session: Stripe.Checkout.Session,
  eventId: string,
  status: OrderStatus,
) {
  const items = session.line_items?.data.map(item => ({
    priceId: item.price?.id,
    productId: typeof item.price?.product === "string" ? item.price.product : item.price?.product?.id,
    name: item.description,
    quantity: item.quantity,
    unitAmount: item.price?.unit_amount,
    totalAmount: item.amount_total,
  })) ?? [];

  return {
    sessionId: session.id,
    orderReference: session.metadata?.internalOrderReference ?? null,
    eventId,
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    status,
    paymentStatus: session.payment_status ?? null,
    currency: session.currency ?? null,
    subtotalAmount: session.amount_subtotal ?? null,
    discountAmount: session.total_details?.amount_discount ?? null,
    shippingAmount: session.total_details?.amount_shipping ?? null,
    taxAmount: session.total_details?.amount_tax ?? null,
    totalAmount: session.amount_total ?? null,
    customerEmail: session.customer_details?.email ?? null,
    customerName: session.customer_details?.name ?? null,
    // jsonb columns take structured values directly; stringifying would store
    // the JSON as an opaque quoted string and break querying.
    shippingAddress: session.collected_information?.shipping_details ?? null,
    items,
  };
}
