import { NextResponse } from "next/server";
import { getStripe } from "../../../../lib/stripe";
import { getLaborDayOffer, laborDay2026 } from "../../../../lib/labor-day-2026";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const offer = getLaborDayOffer();
  if (offer !== "twenty-percent") return NextResponse.json({ ok: true, offer, promotionCodeReady: false });

  try {
    const stripe = getStripe();
    let coupon;
    try {
      coupon = await stripe.coupons.retrieve(laborDay2026.couponId);
      if (coupon.deleted) throw new Error("Coupon was deleted");
    } catch {
      coupon = await stripe.coupons.create({
        id: laborDay2026.couponId,
        name: "Wynn Essentials Labor Day 2026 - 20% Off",
        percent_off: 20,
        duration: "once",
        redeem_by: Math.floor(laborDay2026.discountEndsAt / 1000),
        metadata: { campaign: "labor-day-2026" },
      });
    }

    const existing = await stripe.promotionCodes.list({ code: laborDay2026.promotionCode, active: true, limit: 1 });
    const promotionCode = existing.data[0] ?? await stripe.promotionCodes.create({
      code: laborDay2026.promotionCode,
      promotion: { type: "coupon", coupon: coupon.id },
      expires_at: Math.floor(laborDay2026.discountEndsAt / 1000),
      metadata: { campaign: "labor-day-2026" },
    });

    return NextResponse.json({ ok: true, offer, promotionCodeReady: promotionCode.active });
  } catch (error) {
    console.error("Labor Day promotion setup failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Promotion setup failed." }, { status: 500 });
  }
}

