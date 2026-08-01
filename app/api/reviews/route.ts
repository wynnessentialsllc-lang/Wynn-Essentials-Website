import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { productReviews, orders } from "../../../db/schema";
import { products } from "../../data";
import { commerceConfig } from "../../../lib/commerce-config";
import { notifyNewReview } from "../../../lib/notify";

// GET is public (approved reviews for the storefront); POST accepts a new
// review and holds it at "pending" for admin moderation in /admin/reviews.
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUGS = new Set(products.map(p => p.slug));
const attempts = new Map<string, { count: number; reset: number }>();

// Public: only approved reviews, and never the reviewer's email. Fails open to
// an empty list if the table or database is unavailable, so a product simply
// falls back to its statically seeded reviews.
export async function GET() {
  try {
    const rows = await getDb()
      .select()
      .from(productReviews)
      .where(eq(productReviews.status, "approved"))
      .orderBy(desc(productReviews.createdAt))
      .limit(1000);
    const reviews = rows.map(r => ({
      id: `db-${r.id}`,
      productSlug: r.productSlug,
      author: r.author,
      location: r.location ?? undefined,
      rating: r.rating,
      title: r.title ?? undefined,
      body: r.body,
      verified: r.verified,
      date: r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : undefined,
    }));
    return NextResponse.json({ reviews }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } });
  } catch {
    return NextResponse.json({ reviews: [] });
  }
}

export async function POST(request: Request) {
  try {
    const forwarded = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local";
    const now = Date.now(), state = attempts.get(forwarded);
    if (state && state.reset > now && state.count >= 4) return NextResponse.json({ error: "Too many reviews. Please try again shortly." }, { status: 429 });
    attempts.set(forwarded, !state || state.reset <= now ? { count: 1, reset: now + 60_000 } : { ...state, count: state.count + 1 });

    if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Invalid request." }, { status: 415 });
    const origin = request.headers.get("origin");
    const siteOrigin = new URL(commerceConfig.siteUrl).origin;
    if (origin && origin !== siteOrigin && !origin.includes("localhost")) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

    const body = await request.json() as { productSlug?: unknown; author?: unknown; email?: unknown; rating?: unknown; title?: unknown; body?: unknown };
    const productSlug = typeof body.productSlug === "string" ? body.productSlug : "";
    const author = typeof body.author === "string" ? body.author.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const rating = typeof body.rating === "number" ? Math.round(body.rating) : 0;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const reviewBody = typeof body.body === "string" ? body.body.trim() : "";

    if (!SLUGS.has(productSlug)) return NextResponse.json({ error: "Unknown product." }, { status: 400 });
    if (author.length < 1 || author.length > 80) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
    if (!EMAIL.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return NextResponse.json({ error: "Please choose a star rating from 1 to 5." }, { status: 400 });
    if (title.length > 120) return NextResponse.json({ error: "That title is too long — please shorten it." }, { status: 400 });
    if (reviewBody.length < 5) return NextResponse.json({ error: "Please add a little more detail about your experience." }, { status: 400 });
    if (reviewBody.length > 2000) return NextResponse.json({ error: "That review is too long — please shorten it." }, { status: 400 });

    const db = getDb();
    // Award the "Verified buyer" badge only when the reviewer's email matches a
    // real order, so the badge always reflects an actual purchase.
    let verified = false;
    try {
      const match = await db.select({ sessionId: orders.sessionId }).from(orders).where(eq(orders.customerEmail, email)).limit(1);
      verified = match.length > 0;
    } catch {
      // If the order lookup fails, default to unverified rather than blocking.
    }

    await db.insert(productReviews).values({
      productSlug,
      author,
      email,
      rating,
      title: title || null,
      body: reviewBody,
      verified,
    });

    // Best-effort owner alert. Never blocks the submission: a notify failure is
    // swallowed so the reviewer still gets a success response.
    const product = products.find(p => p.slug === productSlug);
    await notifyNewReview({
      productName: product ? `${product.name} ${product.subtitle}` : productSlug,
      author,
      rating,
      title: title || null,
      body: reviewBody,
      verified,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Review submission failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Reviews are unavailable right now. Please try again later." }, { status: 503 });
  }
}
