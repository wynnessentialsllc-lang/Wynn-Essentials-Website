import { NextResponse } from "next/server";

// First-party visitor event ingest for the traffic dashboard. No PII: only a
// random visitor id the browser generates. Always answers 204 and never throws
// to the client, so analytics can never break the storefront.
const TYPES = new Set(["pageview", "product_view", "add_to_cart", "begin_checkout", "exit_intent_offer"]);
const attempts = new Map<string, { count: number; reset: number }>();

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "local";
    const now = Date.now(), state = attempts.get(ip);
    // Generous cap — a browsing session fires many events, but this stops abuse.
    if (state && state.reset > now && state.count >= 200) return new NextResponse(null, { status: 204 });
    attempts.set(ip, !state || state.reset <= now ? { count: 1, reset: now + 60_000 } : { ...state, count: state.count + 1 });

    const body = await request.json().catch(() => null) as { visitorId?: unknown; type?: unknown; path?: unknown; productSlug?: unknown } | null;
    const visitorId = typeof body?.visitorId === "string" ? body.visitorId.slice(0, 64) : "";
    const type = typeof body?.type === "string" ? body.type : "";
    if (!visitorId || !TYPES.has(type)) return new NextResponse(null, { status: 204 });
    const path = typeof body?.path === "string" ? body.path.slice(0, 300) : null;
    const productSlug = typeof body?.productSlug === "string" ? body.productSlug.slice(0, 120) : null;

    const { getDb } = await import("../../../db");
    const { events } = await import("../../../db/schema");
    await getDb().insert(events).values({ visitorId, type, path, productSlug });
  } catch {
    // Swallow everything — a failed write must never surface to the visitor.
  }
  return new NextResponse(null, { status: 204 });
}
