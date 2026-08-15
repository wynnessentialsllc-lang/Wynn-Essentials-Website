import { NextResponse } from "next/server";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { subscribers } from "../../../db/schema";
import { brandConfig, products } from "../../data";
import { commerceConfig } from "../../../lib/commerce-config";
import { notifySubscriberWelcome, notifyNewSubscriber, notifyWynnEditWelcome, notifyFirstOrderWelcome } from "../../../lib/notify";
import { normalizeEmail } from "../../../lib/unsubscribe";
import { firstOrderOffer } from "../../../lib/first-order-offer";

// Basic shape check only. Deliverability is confirmed by the email provider that
// eventually consumes this table, not here.
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[a-z]{2,}$/i;
const attempts = new Map<string, { count: number; reset: number }>();

// The ONE thing a successful signup is ever told, byte for byte, whatever
// happened behind it: brand new, already active, suppressed, re-subscribed, or
// stored-but-not-yet-emailed. The endpoint therefore cannot be used to test
// whether an address is on the list, or whether it once unsubscribed.
//
// Nothing downstream may branch on this value — that is the point of it being a
// constant. Outcomes that operations needs to see are logged server-side, and
// the states that actually differ are visible in the subscribers table.
//
// Residual: the request TIME still differs, because a signup that owns the
// welcome waits on the provider and one that does not returns immediately.
// Closing that would mean answering before the send resolves, which would cost
// the release-the-claim-on-certain-failure behaviour that keeps this idempotent.
// The body, the status code and the headers carry no signal.
const SIGNUP_ACCEPTED = { ok: true, status: "received" } as const;

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
    // never REQUIRES marketing consent. It can still carry one: the form shows an
    // optional, unticked opt-in, and `consent` is true only when she ticked it.
    const isWaitlist = source.startsWith("waitlist:");
    if (!EMAIL.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    // Marketing consent is required only to store a contact for marketing use.
    if (!isWaitlist && !consent) return NextResponse.json({ error: "Please agree to receive marketing emails to join." }, { status: 400 });

    const db = getDb();

    // ---- Restock waitlist: transactional, with an OPTIONAL marketing opt-in ----
    // Email is the primary key, so a repeat signup refreshes the same row rather
    // than erroring or duplicating.
    //
    // Two independent things can happen here, and keeping them independent is the
    // whole point:
    //
    //   1. The restock alert. Always recorded, never gated on consent. She asked
    //      to be told when one specific product returns; that request is the
    //      permission, and honouring it is not marketing.
    //   2. Marketing. Recorded ONLY when she ticked the optional box, because
    //      that box is the affirmative opt-in the disclosure describes.
    //
    // The one asymmetry to preserve: an opt-in may UPGRADE an existing row to a
    // marketing subscriber, but a waitlist signup without the box ticked must
    // never DOWNGRADE one — she may already be a subscriber, and joining a
    // waitlist is not a request to leave the newsletter.
    if (isWaitlist) {
      const marketing = consent ? consentRecord(source, brandConfig.consentForms.waitlist) : null;
      await db.insert(subscribers).values({
        email,
        ...(marketing ?? { marketingConsent: false, consentText: brandConfig.waitlistConsent }),
        source,
      }).onConflictDoUpdate({
        target: subscribers.email,
        // Without the opt-in this touches only the waiting state, leaving her
        // marketing standing — consent, consent_at, unsubscribed_at — untouched.
        set: marketing
          ? { ...marketing, unsubscribedAt: null, source, updatedAt: new Date() }
          : { source, updatedAt: new Date() },
      });

      const slug = source.slice("waitlist:".length);
      const product = products.find(p => p.slug === slug);
      // A per-product restock request is confirmed every time it is made.
      await notifySubscriberWelcome({
        email,
        productName: product ? `${product.name} ${product.subtitle}` : null,
      }).catch(() => {});

      // The newsletter welcome is a separate message with its own unsubscribe
      // machinery, and it is claimed the same send-once way as every other door
      // into the list: the update only matches while welcome_sent_at is NULL, so
      // a waitlister who already had a welcome does not collect a second one.
      if (marketing) {
        const claimed = await db.update(subscribers)
          .set({ welcomeSentAt: new Date() })
          .where(and(eq(subscribers.email, email), isNull(subscribers.welcomeSentAt)))
          .returning({ email: subscribers.email });
        if (claimed.length > 0) {
          await notifyNewSubscriber({ email, source }).catch(() => {});
          const delivery = await notifyWynnEditWelcome({ email }).catch(() => ({ ok: false, certainNotSent: false }));
          // Release the claim only when we KNOW nothing was transmitted, so it
          // can be retried later without risking a second copy in her inbox.
          if (!delivery.ok && delivery.certainNotSent) {
            await db.update(subscribers).set({ welcomeSentAt: null }).where(eq(subscribers.email, email)).catch(() => {});
          }
          if (!delivery.ok) console.warn("Wynn Edit welcome not delivered", { source, certainNotSent: delivery.certainNotSent });
        }
      }
      return NextResponse.json(SIGNUP_ACCEPTED);
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
      return NextResponse.json(SIGNUP_ACCEPTED);
    }

    // Owner alert on a genuinely new or returning subscriber. Best-effort;
    // never blocks the response.
    await notifyNewSubscriber({ email, source }).catch(() => {});

    // Exactly ONE welcome per subscriber, whichever door she came through — the
    // claim above is per-subscriber, not per-form, so signing up at both the
    // newsletter section and the first-order popup cannot produce two
    // near-identical welcomes. Which one she gets is decided by the door that
    // won the claim.
    //
    // The popup's welcome carries the offer, and only when there is a live one
    // to carry: with the promo-code field switched off at checkout the code
    // could not be redeemed, so she gets the plain welcome instead of a promise
    // the checkout would refuse. The popup still shows her the code on screen
    // either way — that path is unchanged.
    const offer = source === "first-order-popup" ? firstOrderOffer() : null;
    if (source === "first-order-popup" && !offer) {
      console.warn("First-order welcome fell back to the plain welcome: no live offer to advertise (STRIPE_PROMOTION_CODES_ENABLED, or an empty code/label)");
    }
    const delivery = offer
      ? await notifyFirstOrderWelcome({ email, offer }).catch(() => ({ ok: false, certainNotSent: false }))
      : await notifyWynnEditWelcome({ email }).catch(() => ({ ok: false, certainNotSent: false }));

    // Release the claim only when we KNOW nothing was transmitted, so a
    // configuration problem or a provider rejection can be retried later
    // without risking a second copy landing in her inbox.
    if (!delivery.ok && delivery.certainNotSent) {
      await db.update(subscribers).set({ welcomeSentAt: null }).where(eq(subscribers.email, email)).catch(() => {});
    }
    // Delivery does not change the answer. The confirmation promises nothing
    // about an email having been sent, so there is no outcome to disclose —
    // and disclosing one would be exactly the enumeration signal this endpoint
    // must not emit. Operations reads it from the log instead.
    if (!delivery.ok) console.warn("Wynn Edit welcome not delivered", { source, certainNotSent: delivery.certainNotSent });

    return NextResponse.json(SIGNUP_ACCEPTED);
  } catch (error) {
    // A missing database connection string throws here; report it as unavailable
    // rather than leaking configuration detail to the client.
    console.error("Newsletter signup failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Signup is unavailable right now. Please try again later." }, { status: 503 });
  }
}
