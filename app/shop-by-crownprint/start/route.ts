import { NextResponse } from "next/server";
import { buildOutboundRedirect, clearMatchSession, siteOrigin } from "../../../lib/crownprint";

// OUTBOUND ONLY. Every Wynn-initiated CrownPrint hop starts here:
//
//   ?flow=connect   → {HWL_API_BASE_URL}/crownprint/connect  (existing CrownPrint)
//   ?flow=create    → HWL_ASSESSMENT_URL                     (paid CrownPrint purchase/assessment)
//   ?flow=refresh   → HWL_CROWNSTATE_UPDATE_URL              (stale CrownState)
//   ?disconnect=1   → clear this device's Wynn session
//
// This route is deliberately NOT the HWL callback. The callback lives at
// /shop-by-crownprint/connect and does nothing but exchange a code. Keeping the
// source and the callback on separate paths means nothing HWL echoes back can
// be re-read as "start another outbound hop", which is what turns a failed
// round-trip into a loop.
//
// Only a validated `return` URL leaves this site — never CrownPrint answers,
// user ids, scores, CrownState, CrownHistory, or report content.
export const dynamic = "force-dynamic";

const LANDING = "/shop-by-crownprint";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = await siteOrigin();
  const landing = (params = "") => NextResponse.redirect(`${origin}${LANDING}${params}`, { status: 303 });

  // Disconnect: forget this device's Wynn CrownPrint session.
  if (url.searchParams.get("disconnect")) {
    await clearMatchSession();
    return landing("?status=disconnected");
  }

  const requested = url.searchParams.get("flow");
  const flow = requested === "create" ? "create" : requested === "refresh" || requested === "update" ? "refresh" : "connect";

  const redirect = await buildOutboundRedirect(flow);
  // Not configured (or configured to a Wynn URL, which would self-redirect) →
  // explicit unavailable state. Never a fake match, never a silent bounce.
  if (!redirect) return landing("?status=unavailable");
  return NextResponse.redirect(redirect, { status: 303 });
}
