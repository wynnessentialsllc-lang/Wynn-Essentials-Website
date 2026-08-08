import { NextResponse } from "next/server";
import { getDb } from "../../../db";
import { supportMessages } from "../../../db/schema";
import { commerceConfig } from "../../../lib/commerce-config";
import { notifyNewSupportMessage } from "../../../lib/notify";

// Basic shape check only; the inbox that reads these confirms deliverability.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Only these subjects are accepted, mirroring the storefront's topic picker.
const TOPICS = new Set(["Order", "Shipping", "Returns & Refunds", "Product Question", "Wholesale", "Other"]);
const attempts = new Map<string, { count: number; reset: number }>();

export async function POST(request: Request) {
  try {
    const forwarded = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local";
    const now = Date.now(), state = attempts.get(forwarded);
    if (state && state.reset > now && state.count >= 6) return NextResponse.json({ error: "Too many messages. Please try again shortly." }, { status: 429 });
    attempts.set(forwarded, !state || state.reset <= now ? { count: 1, reset: now + 60_000 } : { ...state, count: state.count + 1 });

    if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Invalid request." }, { status: 415 });
    const origin = request.headers.get("origin");
    const siteOrigin = new URL(commerceConfig.siteUrl).origin;
    if (origin && origin !== siteOrigin && !origin.includes("localhost")) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

    const body = await request.json() as { name?: unknown; email?: unknown; orderNumber?: unknown; topic?: unknown; message?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber.trim() : "";
    const topic = typeof body.topic === "string" && TOPICS.has(body.topic) ? body.topic : "Other";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (name.length < 1 || name.length > 120) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
    if (!EMAIL.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (orderNumber.length > 60) return NextResponse.json({ error: "That order number looks too long." }, { status: 400 });
    if (message.length < 5) return NextResponse.json({ error: "Please add a little more detail so we can help." }, { status: 400 });
    if (message.length > 4000) return NextResponse.json({ error: "That message is too long — please shorten it." }, { status: 400 });

    await getDb().insert(supportMessages).values({
      name,
      email,
      orderNumber: orderNumber || null,
      topic,
      message,
    });

    // Best-effort owner alert so order/website issues surface by email, not just
    // in the admin inbox. Never blocks the response: a notify failure is swallowed
    // so the sender still gets a success confirmation.
    await notifyNewSupportMessage({
      name,
      email,
      orderNumber: orderNumber || null,
      topic,
      message,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (error) {
    // A missing database connection string throws here; report it as unavailable
    // rather than leaking configuration detail to the client.
    console.error("Support message failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Support is unavailable right now. Please email us directly." }, { status: 503 });
  }
}
