import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { subscribers } from "../../../db/schema";
import { brandConfig, products } from "../../data";
import { commerceConfig } from "../../../lib/commerce-config";
import { notifySubscriberWelcome } from "../../../lib/notify";

// Basic shape check only. Deliverability is confirmed by the email provider that
// eventually consumes this table, not here.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const attempts = new Map<string, { count: number; reset: number }>();

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
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
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
    // Detect a genuinely new subscriber so the welcome email is sent once, not
    // on every re-submission of an address already on the list.
    const existing = await db.select({ email: subscribers.email }).from(subscribers).where(eq(subscribers.email, email)).limit(1);
    const isNew = existing.length === 0;

    // Email is the primary key, so a repeat signup refreshes the same row rather
    // than erroring or duplicating. The exact consent language shown is stored
    // alongside the choice for a durable compliance record. A waitlist signup
    // records NO marketing consent and, on an existing row, must never downgrade
    // a marketing subscriber — so it only refreshes the source/timestamp.
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
    } else {
      await db.insert(subscribers).values({
        email,
        marketingConsent: consent,
        consentText: brandConfig.consent,
        source,
      }).onConflictDoUpdate({
        target: subscribers.email,
        set: { marketingConsent: consent, consentText: brandConfig.consent, source, updatedAt: new Date() },
      });
    }

    // Best-effort confirmation email. A waitlist signup ("waitlist:<slug>") gets
    // the restock-confirmation copy for that product every time (it's a per-
    // product request); a marketing signup gets the welcome copy once, and a
    // first-order popup signup also gets the discount code.
    if (isWaitlist || isNew) {
      const slug = source.startsWith("waitlist:") ? source.slice("waitlist:".length) : null;
      const product = slug ? products.find(p => p.slug === slug) : null;
      await notifySubscriberWelcome({
        email,
        productName: product ? `${product.name} ${product.subtitle}` : null,
        promoCode: source === "first-order-popup" ? brandConfig.firstOrder.code : null,
        promoLabel: source === "first-order-popup" ? brandConfig.firstOrder.discountLabel : null,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // A missing database connection string throws here; report it as unavailable
    // rather than leaking configuration detail to the client.
    console.error("Newsletter signup failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Signup is unavailable right now. Please try again later." }, { status: 503 });
  }
}
