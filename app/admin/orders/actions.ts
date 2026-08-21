"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { orders } from "../../../db/schema";
import { isAuthenticated, verifyPassword, createSession, destroySession } from "../../../lib/admin-auth";
import { notifyCustomerPreorderProcessing, notifyCustomerPreorderQualityCheck, notifyCustomerShipped } from "../../../lib/notify";

const attempts = new Map<string, { count: number; reset: number }>();

function rateLimited(key: string) {
  const now = Date.now();
  const state = attempts.get(key);
  if (state && state.reset > now && state.count >= 5) return true;
  attempts.set(key, !state || state.reset <= now ? { count: 1, reset: now + 15 * 60_000 } : { ...state, count: state.count + 1 });
  return false;
}

export async function signIn(_prev: string | null, formData: FormData): Promise<string | null> {
  if (rateLimited("signin")) return "Too many attempts. Try again in a few minutes.";
  if (!(await verifyPassword(formData.get("token")))) return "Incorrect access token.";
  await createSession(formData.get("remember") === "1");
  revalidatePath("/admin/orders");
  return null;
}

export async function signOut() {
  await destroySession();
  revalidatePath("/admin/orders");
}

const FULFILLMENT_STATUSES = ["unfulfilled", "fulfilled"] as const;

export async function setFulfillment(formData: FormData) {
  // A server action is a separately addressable endpoint. It must re-check
  // authentication rather than trusting that the page rendered it.
  if (!(await isAuthenticated())) throw new Error("Not authorized.");

  const sessionId = formData.get("sessionId");
  const status = formData.get("status");
  if (typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Invalid order.");
  if (typeof status !== "string" || !FULFILLMENT_STATUSES.includes(status as (typeof FULFILLMENT_STATUSES)[number])) throw new Error("Invalid status.");

  await getDb()
    .update(orders)
    .set({ fulfillmentStatus: status, updatedAt: new Date() })
    .where(eq(orders.sessionId, sessionId));

  revalidatePath("/admin/orders");
}

const CARRIERS = ["USPS", "UPS", "FedEx", "DHL", "Other"] as const;

const PREORDER_EMAIL_STAGES = ["processing", "quality-check"] as const;

export async function sendPreorderUpdate(formData: FormData) {
  if (!(await isAuthenticated())) throw new Error("Not authorized.");
  const sessionId = formData.get("sessionId");
  const stage = formData.get("stage");
  if (typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Invalid order.");
  if (typeof stage !== "string" || !PREORDER_EMAIL_STAGES.includes(stage as (typeof PREORDER_EMAIL_STAGES)[number])) throw new Error("Invalid preorder stage.");

  const [order] = await getDb().select().from(orders).where(eq(orders.sessionId, sessionId)).limit(1);
  if (!order?.customerEmail) throw new Error("This order has no customer email.");
  const items = Array.isArray(order.items) ? order.items as { name?: string | null }[] : [];
  if (!items.some(item => item.name?.includes("PRE-ORDER"))) throw new Error("This is not a preorder.");
  const info = { customerEmail: order.customerEmail, customerName: order.customerName, orderReference: order.orderReference };
  const sent = stage === "processing" ? await notifyCustomerPreorderProcessing(info) : await notifyCustomerPreorderQualityCheck(info);
  if (!sent) throw new Error("The preorder email could not be sent. Check the Resend configuration.");
  revalidatePath("/admin/orders");
}

// Marks an order shipped: records the carrier + tracking number, flips
// fulfillment to "fulfilled", and emails the customer their tracking link.
// The email is best-effort and never blocks the status update.
export async function setShipped(formData: FormData) {
  if (!(await isAuthenticated())) throw new Error("Not authorized.");

  const sessionId = formData.get("sessionId");
  const carrier = formData.get("carrier");
  const trackingNumber = formData.get("trackingNumber");
  if (typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Invalid order.");
  const carrierValue = typeof carrier === "string" && CARRIERS.includes(carrier as (typeof CARRIERS)[number]) ? carrier : null;
  const tracking = typeof trackingNumber === "string" ? trackingNumber.trim().slice(0, 100) : "";
  if (!tracking) throw new Error("Enter a tracking number.");

  const db = getDb();
  const [updated] = await db
    .update(orders)
    .set({ fulfillmentStatus: "fulfilled", carrier: carrierValue, trackingNumber: tracking, shippedAt: new Date(), updatedAt: new Date() })
    .where(eq(orders.sessionId, sessionId))
    .returning();

  if (updated) {
    await notifyCustomerShipped({
      customerEmail: updated.customerEmail,
      customerName: updated.customerName,
      orderReference: updated.orderReference,
      carrier: updated.carrier,
      trackingNumber: updated.trackingNumber,
      items: Array.isArray(updated.items) ? updated.items as { name?: string | null; quantity?: number | null; totalAmount?: number | null }[] : [],
    }).catch(() => {});
  }

  revalidatePath("/admin/orders");
}
