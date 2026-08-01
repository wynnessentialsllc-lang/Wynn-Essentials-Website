import { NextResponse } from "next/server";
import { getDb } from "../../../db";
import { abandonedCarts } from "../../../db/schema";
import { products } from "../../data";
import { commerceConfig } from "../../../lib/commerce-config";

// Records a cart snapshot for a shopper who has given an email and is starting
// checkout. A scheduled job (/api/cron/abandoned-carts) later emails a reminder
// if no paid order follows. Fire-and-forget from the client; always 204/ok.
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BY_SLUG = new Map(products.map(p => [p.slug, p]));
const attempts = new Map<string, { count: number; reset: number }>();

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local";
    const now = Date.now(), state = attempts.get(ip);
    if (state && state.reset > now && state.count >= 20) return new NextResponse(null, { status: 204 });
    attempts.set(ip, !state || state.reset <= now ? { count: 1, reset: now + 60_000 } : { ...state, count: state.count + 1 });

    if (!request.headers.get("content-type")?.includes("application/json")) return new NextResponse(null, { status: 204 });
    const origin = request.headers.get("origin");
    const siteOrigin = new URL(commerceConfig.siteUrl).origin;
    if (origin && origin !== siteOrigin && !origin.includes("localhost")) return new NextResponse(null, { status: 204 });

    const body = await request.json().catch(() => null) as { email?: unknown; visitorId?: unknown; items?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const visitorId = typeof body?.visitorId === "string" ? body.visitorId.slice(0, 64) : null;
    if (!EMAIL.test(email) || email.length > 254) return new NextResponse(null, { status: 204 });

    // Enrich the raw {slug, quantity, color} lines from the catalog, dropping
    // anything unknown or without a price so the reminder shows real products.
    const raw = Array.isArray(body?.items) ? body!.items as { slug?: unknown; quantity?: unknown; color?: unknown }[] : [];
    const items = raw
      .map(i => {
        const p = typeof i.slug === "string" ? BY_SLUG.get(i.slug) : undefined;
        if (!p || p.price == null) return null;
        const quantity = Math.max(1, Math.min(99, Math.floor(Number(i.quantity) || 1)));
        return { slug: p.slug, name: `${p.name} ${p.subtitle}`, price: p.price, quantity, ...(typeof i.color === "string" ? { color: i.color.slice(0, 40) } : {}) };
      })
      .filter(Boolean) as { slug: string; name: string; price: number; quantity: number; color?: string }[];
    if (items.length === 0) return new NextResponse(null, { status: 204 });

    const subtotal = Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100);

    await getDb()
      .insert(abandonedCarts)
      .values({ email, visitorId, items, subtotal, status: "pending", emailedAt: null, updatedAt: new Date() })
      .onConflictDoUpdate({ target: abandonedCarts.email, set: { visitorId, items, subtotal, status: "pending", emailedAt: null, updatedAt: new Date() } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Abandoned-cart snapshot failed", error instanceof Error ? error.message : "Unknown error");
    return new NextResponse(null, { status: 204 });
  }
}
