"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { orders } from "../../../db/schema";
import { isAuthenticated, verifyPassword, createSession, destroySession } from "../../../lib/admin-auth";

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
  await createSession();
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
