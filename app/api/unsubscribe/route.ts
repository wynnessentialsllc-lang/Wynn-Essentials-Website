import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { subscribers } from "../../../db/schema";
import { verifyUnsubscribe, normalizeEmail } from "../../../lib/unsubscribe";

// Processes a confirmed unsubscribe from the /unsubscribe page's form. The email
// and its HMAC token are verified before anything is written, so the link can't
// be forged. Turning off marketing_consent (and stamping unsubscribed_at) is
// idempotent, and we always redirect to the same "done" state whether or not the
// address was on file, so this never reveals who is subscribed.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const email = normalizeEmail(String(form?.get("e") ?? ""));
  const token = String(form?.get("t") ?? "");
  const to = (state: string) => NextResponse.redirect(new URL(`/unsubscribe?state=${state}`, request.url), { status: 303 });

  if (!email || !verifyUnsubscribe(email, token)) return to("invalid");
  try {
    const db = getDb();
    await db
      .update(subscribers)
      .set({ marketingConsent: false, unsubscribedAt: new Date(), consentText: "Unsubscribed via email link", updatedAt: new Date() })
      .where(eq(subscribers.email, email));
    return to("done");
  } catch {
    return to("error");
  }
}
