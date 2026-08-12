import { NextResponse } from "next/server";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { subscribers } from "../../../db/schema";
import { brandConfig, products } from "../../data";
import { commerceConfig } from "../../../lib/commerce-config";
import { notifySubscriberWelcome, notifyNewSubscriber, notifyWynnEditWelcome } from "../../../lib/notify";
import { normalizeEmail } from "../../../lib/unsubscribe";

// Basic shape check only. Deliverability is confirmed by the email provider that
// eventually consumes this table, not here.
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[a-z]{2,}$/i;
const attempts = new Map<string, { count: number; reset: number }>();

// What the browser is told. Deliberately coarse: "subscribed" is the only state
// that confirms a specific address is newly on the list, and it is reachable
// only by someone who just supplied fresh affirmative consent for an address
// that was not already active. Everything else — already subscribed, suppressed,
// previously unsubscribed without new consent — collapses into "eligible", so
// the endpoint cannot be used to test whether an address is on the list.
type SignupStatus =
  | "subscribed"   // new (or genuinely re-subscribed) AND the provider accepted the welcome
  | "recorded"     // consent stored, but no welcome was accepted — never claim a send
  | "eligible";    // nothing to do, said without confirming or denying membership

/**
 * Marketing-consent record written alongside every affirmative opt-in. `text`
 * is the exact disclosure rendered next to the checkbox, `version` pins the
 * wording that was in force, `formId` names the placement, and `consentAt` is
 * the moment she ticked the box.
 *
 * The signup IP is intentionally not part of this record — see
 * drizzle/0017_wynn_edit_consent.sql.
 */
function consentRecord(source: string, formId: string) {
  return {
    marketingConsent: true,
    consentText: brandConfig.consent,
    consentVersion: brandConfig.consentVersion,
    consentAt: new Date(),
    formId,
    source,
  };
}

export async function POST(request: Request) {
  try {
    const forwarded = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local";
    const now = Date.now(), state = attempts.get(forwarded);
    if (state && state.reset > now && state.count >= 10) return NextResponse.json({ error: "Too many signups. Please try again shortly." }, { status: 429 });
    attempts.set(forwarded, !state || state.reset <= now ? { count: 1, reset: now + 60_000 } : { ...state, count: state.count + 1 });

    if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Invalid request." }, { status: 415 });
    const origin = request.headers.get("origin");
    const siteOrigin = new URL(commerceConfig.siteUrl).origin;
    if (origin && origin !== siteOrigin && !origin.includes("localhost")) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

    const body = await request.json() as { email?: unknown; consent?: unknown; source?: unknown };
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const consent = body.consent === true;
    // Whitelisted so a signup can tag itself (e.g. a product restock waitlist)
    // without accepting arbitrary values.
    const source = typeof body.source === "string" && /^(the-wynn-edit|first-order-popup|waitlist:[a-z0-9-]{1,60})$/.test(body.source) ? body.source : "the-wynn-edit";
    // A restock waitlist is a one-time transactional alert, not marketing — so it
    // never requires marketing consent and never records one.
    const isWaitlist = source.startsWith("waitlist:");
    if (!EMAIL.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    // Marketing consent is required only to store a contact for marketing use.
    if (!isWaitlist && !consent) return NextResponse.json({ error: "Please agree to receive marketing emails to join." }, { status: 400 });

    const db = getDb();

    // ---- Restock waitlist: transactional, unchanged, no marketing consent ----
    // Email is the primary key, so a repeat signup refreshes the same row rather
    // than erroring or duplicating. A waitlist signup records NO marketing
    // consent and, on an existing row, must never upgrade or downgrade a
    // marketing subscriber — so it only refreshes the source/timestamp.
    if (isWaitlist) {
      await db.insert(subscribers).values({
        email,
        marketingConsent: false,
        consentText: brandConfig.waitlistConsent,
        source,
      }).onConflictDoUpdate({
        target: subscribers.email,
        set: { source, updatedAt: new Date() },
      });
      const slug = source.slice("waitlist:".length);
      const product = products.find(p => p.slug === slug);
      // A per-product restock request is confirmed every time it is made.
      await notifySubscriberWelcome({
        email,
        productName: product ? `${product.name} ${product.subtitle}` : null,
      }).catch(() => {});
      return NextResponse.json({ ok: true, status: "subscribed" satisfies SignupStatus });
    }

    // ---- Marketing signup ----
    const formId = source === "first-order-popup" ? brandConfig.consentForms.firstOrderPopup : brandConfig.consentForms.newsletter;
    const record = consentRecord(source, formId);

    // Three mutually exclusive claims, tried in order. Each is a single
    // statement whose WHERE clause is the claim itself, so two concurrent
    // submissions of the same address — a double-click, a retried fetch, a
    // replayed request — cannot both win. Whoever wins owns the one welcome
    // email for this subscription event.

    // 1. Brand-new subscriber. The insert is the claim: welcome_sent_at is
    //    stamped in the same statement that creates the row, and a second
    //    concurrent insert hits the conflict and returns nothing.
    const created = await db.insert(subscribers).values({
      email,
      ...record,
      welcomeSentAt: new Date(),
    }).onConflictDoNothing({ target: subscribers.email }).returning({ email: subscribers.email });

    // 2. Genuine re-subscription: the row exists but is NOT an active marketing
    //    subscriber — she previously unsubscribed, or only ever gave a
    //    transactional waitlist address. She has now affirmatively consented
    //    again, which is the only thing that may bring her back. Re-subscribing
    //    and re-claiming the welcome happen in one statement, so a previously
    //    unsubscribed address can never be resurrected twice.
    const resubscribed = created.length > 0 ? [] : await db.update(subscribers)
      .set({ ...record, unsubscribedAt: null, welcomeSentAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(subscribers.email, email),
        or(isNotNull(subscribers.unsubscribedAt), eq(subscribers.marketingConsent, false)),
      ))
      .returning({ email: subscribers.email });

    // 3. An active subscriber who has never actually been welcomed. That covers
    //    a contact imported from a previous platform, and a signup whose
    //    welcome was definitively rejected by the provider and therefore
    //    released its claim. She has just asked to join again, so honour it —
    //    still exactly once, because this claim also only matches while
    //    welcome_sent_at is NULL.
    const unwelcomed = created.length > 0 || resubscribed.length > 0 ? [] : await db.update(subscribers)
      .set({ consentText: brandConfig.consent, consentVersion: brandConfig.consentVersion, formId, source, welcomeSentAt: new Date(), updatedAt: new Date() })
      .where(and(eq(subscribers.email, email), isNull(subscribers.welcomeSentAt)))
      .returning({ email: subscribers.email });

    const claimedWelcome = created.length > 0 || resubscribed.length > 0 || unwelcomed.length > 0;

    // 4. Already an active, already-welcomed subscriber. Re-submitting the form
    //    is not a new subscription event: refresh the disclosure record so we
    //    know what she was most recently shown, but do not touch consent_at
    //    (the consent behind the live subscription) and do not send anything.
    if (!claimedWelcome) {
      await db.update(subscribers)
        .set({ consentText: brandConfig.consent, consentVersion: brandConfig.consentVersion, formId, source, updatedAt: new Date() })
        .where(eq(subscribers.email, email));
      return NextResponse.json({ ok: true, status: "eligible" satisfies SignupStatus });
    }

    // Owner alert on a genuinely new or returning subscriber. Best-effort;
    // never blocks the response.
    await notifyNewSubscriber({ email, source }).catch(() => {});

    // The first-order popup is its own established flow and carries the
    // production welcome-offer code; The Wynn Edit gets the branded editorial
    // welcome. Neither invents an incentive.
    const delivery = source === "first-order-popup"
      ? await notifySubscriberWelcome({
          email,
          promoCode: brandConfig.firstOrder.code,
          promoLabel: brandConfig.firstOrder.discountLabel,
        }).then(ok => ({ ok, certainNotSent: !ok })).catch(() => ({ ok: false, certainNotSent: false }))
      : await notifyWynnEditWelcome({ email }).catch(() => ({ ok: false, certainNotSent: false }));

    if (!delivery.ok) {
      // Release the claim only when we KNOW nothing was transmitted, so a
      // configuration problem or a provider rejection can be retried later
      // without risking a second copy landing in her inbox.
      if (delivery.certainNotSent) {
        await db.update(subscribers).set({ welcomeSentAt: null }).where(eq(subscribers.email, email)).catch(() => {});
      }
      // She is subscribed either way — we just refuse to say an email is coming.
      return NextResponse.json({ ok: true, status: "recorded" satisfies SignupStatus });
    }

    return NextResponse.json({ ok: true, status: "subscribed" satisfies SignupStatus });
  } catch (error) {
    // A missing database connection string throws here; report it as unavailable
    // rather than leaking configuration detail to the client.
    console.error("Newsletter signup failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Signup is unavailable right now. Please try again later." }, { status: 503 });
  }
}
