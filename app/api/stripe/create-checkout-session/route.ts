import { NextResponse } from "next/server";
import { products } from "../../../data";
import { getStripe } from "../../../../lib/stripe";
import { commerceConfig } from "../../../../lib/commerce-config";

type IncomingItem = { productId?: unknown; variantId?: unknown; quantity?: unknown; color?: unknown };

// Live sold-out overrides (slug -> soldOut) from the inventory table. Imported
// lazily and fails open to no overrides if the table or database is unavailable,
// so a checkout is never blocked by an inventory read.
async function loadInventoryOverride(): Promise<Map<string, boolean>> {
  try {
    const { getDb } = await import("../../../../db");
    const { productInventory } = await import("../../../../db/schema");
    const rows = await getDb().select().from(productInventory);
    return new Map(rows.map(r => [r.slug, r.soldOut]));
  } catch {
    return new Map();
  }
}
const attempts = new Map<string, { count: number; reset: number }>();

export async function POST(request: Request) {
  try {
    const forwarded = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local";
    const now = Date.now(), state = attempts.get(forwarded);
    if (state && state.reset > now && state.count >= 10) return NextResponse.json({ error: "Too many checkout attempts. Please try again shortly." }, { status: 429 });
    attempts.set(forwarded, !state || state.reset <= now ? { count: 1, reset: now + 60_000 } : { ...state, count: state.count + 1 });

    if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Invalid request." }, { status: 415 });
    const origin = request.headers.get("origin");
    const siteOrigin = new URL(commerceConfig.siteUrl).origin;
    if (origin && origin !== siteOrigin && !origin.includes("localhost")) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

    const body = await request.json() as { items?: IncomingItem[]; invitationAccepted?: boolean; routineRecommendationId?: string };
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > commerceConfig.maxLineItems) return NextResponse.json({ error: "Your bag is empty or contains too many items." }, { status: 400 });
    // Live availability overrides the catalog's soldOut flag, matching the
    // storefront. Fails open to the catalog default if inventory is unavailable.
    const inventoryOverride = await loadInventoryOverride();
    let subtotalCents = 0;
    const resolved = body.items.map(item => {
      if (typeof item.productId !== "string" || typeof item.variantId !== "string" || !Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > commerceConfig.maxQuantityPerItem) throw new Error("INVALID_ITEM");
      const product = products.find(p => p.slug === item.productId);
      if (!product || product.variantId !== item.variantId) throw new Error("INVALID_ITEM");
      // A product with color options requires a valid, in-catalog color choice.
      const color = typeof item.color === "string" ? item.color : undefined;
      if (product.colors?.length && (!color || !product.colors.includes(color))) throw new Error("INVALID_ITEM");
      if (!product.stripePriceId || !/^price_[A-Za-z0-9]+$/.test(product.stripePriceId)) throw new Error("UNCONFIGURED_ITEM");
      // A sold-out item can never be checked out, even from a stale cart. Live
      // inventory overrides the catalog flag; unlisted products use the flag.
      const effectiveSoldOut = inventoryOverride.has(product.slug) ? inventoryOverride.get(product.slug)! : Boolean(product.soldOut);
      if (effectiveSoldOut) throw new Error("SOLD_OUT");
      // Subtotal comes from the server catalog, never from the client payload.
      subtotalCents += Math.round((product.price ?? 0) * 100) * Number(item.quantity);
      // Colored items ship at the same price, so an inline price carries the chosen
      // color onto the line item (and into the recorded order) without a per-color Stripe price.
      if (color) return { price_data: { currency: "usd", unit_amount: Math.round((product.price ?? 0) * 100), product_data: { name: `${product.name} — ${product.subtitle} · ${color}`, metadata: { wynn_slug: product.slug, color } } }, quantity: Number(item.quantity) };
      return { price: product.stripePriceId, quantity: Number(item.quantity) };
    });
    // Honors the "free U.S. shipping over $50" promise made on the storefront.
    const qualifiesForFreeShipping = commerceConfig.freeShippingRateId !== null && subtotalCents >= commerceConfig.freeShippingThresholdCents;
    const groundRateId = qualifiesForFreeShipping ? commerceConfig.freeShippingRateId : commerceConfig.standardShippingRateId;
    const shipping = [groundRateId, commerceConfig.expeditedShippingRateId].filter((x): x is string => Boolean(x)).map(shipping_rate => ({ shipping_rate }));
    if (!shipping.length) return NextResponse.json({ error: "Shipping is not configured yet." }, { status: 503 });
    const cartId = crypto.randomUUID();
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: resolved,
      billing_address_collection: "auto",
      shipping_address_collection: { allowed_countries: [...commerceConfig.allowedShippingCountries] },
      shipping_options: shipping,
      automatic_tax: { enabled: commerceConfig.automaticTaxEnabled },
      allow_promotion_codes: commerceConfig.promotionCodesEnabled,
      customer_creation: "always",
      success_url: `${commerceConfig.siteUrl}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${commerceConfig.siteUrl}/order/cancelled`,
      client_reference_id: cartId,
      metadata: { cartId, internalOrderReference: `WE-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, source: "wynn-essentials-website", invitationAccepted: String(Boolean(body.invitationAccepted)), ...(body.routineRecommendationId ? { routineRecommendationId: body.routineRecommendationId.slice(0, 100) } : {}) },
    });
    if (!session.url) throw new Error("NO_SESSION_URL");
    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_ITEM") return NextResponse.json({ error: "One or more bag items are invalid." }, { status: 400 });
    if (error instanceof Error && error.message === "UNCONFIGURED_ITEM") return NextResponse.json({ error: "One or more products are not available for checkout yet." }, { status: 409 });
    if (error instanceof Error && error.message === "SOLD_OUT") return NextResponse.json({ error: "One or more items in your bag are sold out. Please remove them to continue." }, { status: 409 });
    console.error("Checkout session creation failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Secure checkout is unavailable right now. Please try again later." }, { status: 500 });
  }
}
