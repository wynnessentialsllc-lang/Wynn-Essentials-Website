import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { subscribers } from "../../../db/schema";
import { verifyUnsubscribe, normalizeEmail } from "../../../lib/unsubscribe";

// Processes a confirmed unsubscribe. Two callers land here, both on the signed
// URL from lib/unsubscribe.ts:
//
//   1. A human, via the /unsubscribe page's confirm form (e and t in the body).
//      Answered with a redirect back to that page's "done" state.
//   2. A mailbox provider honouring RFC 8058 one-click (List-Unsubscribe-Post),
//      which POSTs "List-Unsubscribe=One-Click" to the URL itself, with e and t
//      only in the query string, and expects a plain 2xx. A redirect would be
//      read as a failure, so that shape gets 200 text/plain.
//
// The email and its HMAC token are verified before anything is written, so the
// link can't be forged. Turning off marketing_consent (and stamping
// unsubscribed_at) is idempotent, and both shapes report the same outcome
// whether or not the address was on file, so this never reveals who is
// subscribed.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  // One-click sends the marker in the body and the identity in the query; the
  // on-page form sends the identity in the body. Body wins where both exist.
  const oneClick = String(form?.get("List-Unsubscribe") ?? "") === "One-Click";
  const email = normalizeEmail(String(form?.get("e") ?? url.searchParams.get("e") ?? ""));
  const token = String(form?.get("t") ?? url.searchParams.get("t") ?? "");

  const done = (state: string, ok: boolean) =>
    oneClick
      ? new NextResponse(ok ? "Unsubscribed" : "Unable to process this request", {
          status: ok ? 200 : 400,
          headers: { "content-type": "text/plain; charset=utf-8" },
        })
      : NextResponse.redirect(new URL(`/unsubscribe?state=${state}`, request.url), { status: 303 });

  if (!email || !verifyUnsubscribe(email, token)) return done("invalid", false);
  try {
    const db = getDb();
    await db
      .update(subscribers)
      .set({ marketingConsent: false, unsubscribedAt: new Date(), consentText: "Unsubscribed via email link", updatedAt: new Date() })
      .where(eq(subscribers.email, email));
    return done("done", true);
  } catch {
    return done("error", false);
  }
}
