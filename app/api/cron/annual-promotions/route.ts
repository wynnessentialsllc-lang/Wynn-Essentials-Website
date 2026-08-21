import { NextResponse } from "next/server";
import { annualPromotionProductIds, promotionsToActivate } from "../../../../lib/annual-promotions";
import { getStripe } from "../../../../lib/stripe";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const active = promotionsToActivate();
  if (active.length === 0) return NextResponse.json({ ok: true, active: [] });

  try {
    const stripe = getStripe();
    const results = [];
    for (const promotion of active) {
      const couponId = `wynn_${promotion.id.replaceAll("-", "_")}_${promotion.percentOff}`;
      let coupon;
      try {
        coupon = await stripe.coupons.retrieve(couponId);
        if (coupon.deleted) throw new Error("Coupon was deleted");
      } catch {
        coupon = await stripe.coupons.create({
          id: couponId,
          name: `Wynn Essentials ${promotion.name} - ${promotion.percentOff}% Off`,
          percent_off: promotion.percentOff,
          duration: "once",
          redeem_by: Math.floor(promotion.endsAt.getTime() / 1000),
          applies_to: { products: annualPromotionProductIds },
          metadata: { campaign: promotion.id, excludes: "boho-hair,gift-cards" },
        });
      }

      const existing = await stripe.promotionCodes.list({ code: promotion.code, active: true, limit: 10 });
      const matching = existing.data.find(item => item.promotion.type === "coupon" && item.promotion.coupon === coupon.id);
      const code = matching ?? await stripe.promotionCodes.create({
        code: promotion.code,
        promotion: { type: "coupon", coupon: coupon.id },
        expires_at: Math.floor(promotion.endsAt.getTime() / 1000),
        restrictions: { first_time_transaction: false },
        metadata: { campaign: promotion.id, excludes: "boho-hair,gift-cards" },
      });
      results.push({ id: promotion.id, code: promotion.code, ready: code.active, endsAt: promotion.endsAt });
    }
    return NextResponse.json({ ok: true, active: results });
  } catch (error) {
    console.error("Annual promotion setup failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Promotion setup failed." }, { status: 500 });
  }
}
