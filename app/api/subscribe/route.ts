import { NextResponse } from "next/server";
import { getDb } from "../../../db";
import { subscribers } from "../../../db/schema";
import { brandConfig } from "../../data";
import { commerceConfig } from "../../../lib/commerce-config";

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

    const body = await request.json() as { email?: unknown; phone?: unknown; consent?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const consent = body.consent === true;
    if (!EMAIL.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    // Marketing consent is required to store a contact for marketing use.
    if (!consent) return NextResponse.json({ error: "Please agree to receive marketing messages to join." }, { status: 400 });
    if (phone.length > 40) return NextResponse.json({ error: "That phone number looks too long." }, { status: 400 });

    const db = getDb();
    // Email is the primary key, so a repeat signup refreshes the same row rather
    // than erroring or duplicating. The exact consent language shown is stored
    // alongside the choice for a durable compliance record.
    await db.insert(subscribers).values({
      email,
      phone: phone || null,
      marketingConsent: consent,
      consentText: brandConfig.consent,
      source: "the-wynn-edit",
    }).onConflictDoUpdate({
      target: subscribers.email,
      set: { phone: phone || null, marketingConsent: consent, consentText: brandConfig.consent, source: "the-wynn-edit", updatedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    // A missing database connection string throws here; report it as unavailable
    // rather than leaking configuration detail to the client.
    console.error("Newsletter signup failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Signup is unavailable right now. Please try again later." }, { status: 503 });
  }
}
