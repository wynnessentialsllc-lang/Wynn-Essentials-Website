"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { supportMessages } from "../../../db/schema";
import { isAuthenticated } from "../../../lib/admin-auth";

const STATUSES = ["new", "resolved"] as const;

export async function setSupportStatus(formData: FormData) {
  // A server action is its own endpoint, so it re-checks authentication rather
  // than trusting the page that rendered it.
  if (!(await isAuthenticated())) throw new Error("Not authorized.");

  const id = Number(formData.get("id"));
  const status = formData.get("status");
  if (!Number.isInteger(id) || id < 1) throw new Error("Invalid message.");
  if (typeof status !== "string" || !STATUSES.includes(status as (typeof STATUSES)[number])) throw new Error("Invalid status.");

  await getDb()
    .update(supportMessages)
    .set({ status, updatedAt: new Date() })
    .where(eq(supportMessages.id, id));

  revalidatePath("/admin/support");
}
