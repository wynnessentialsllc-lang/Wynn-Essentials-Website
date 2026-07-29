"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { productReviews } from "../../../db/schema";
import { isAuthenticated } from "../../../lib/admin-auth";

const STATUSES = ["pending", "approved", "rejected"] as const;

export async function setReviewStatus(formData: FormData) {
  // A server action is its own endpoint, so it re-checks authentication rather
  // than trusting the page that rendered it.
  if (!(await isAuthenticated())) throw new Error("Not authorized.");

  const id = Number(formData.get("id"));
  const status = formData.get("status");
  if (!Number.isInteger(id) || id < 1) throw new Error("Invalid review.");
  if (typeof status !== "string" || !STATUSES.includes(status as (typeof STATUSES)[number])) throw new Error("Invalid status.");

  await getDb()
    .update(productReviews)
    .set({ status, updatedAt: new Date() })
    .where(eq(productReviews.id, id));

  revalidatePath("/admin/reviews");
}

export async function setReviewVerified(formData: FormData) {
  if (!(await isAuthenticated())) throw new Error("Not authorized.");

  const id = Number(formData.get("id"));
  const verified = formData.get("verified") === "true";
  if (!Number.isInteger(id) || id < 1) throw new Error("Invalid review.");

  await getDb()
    .update(productReviews)
    .set({ verified, updatedAt: new Date() })
    .where(eq(productReviews.id, id));

  revalidatePath("/admin/reviews");
}
