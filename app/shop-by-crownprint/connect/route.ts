import { NextResponse } from "next/server";
import {
  buildOutboundRedirect,
  clearMatchSession,
  consumePending,
  createMatchSession,
  exchangeConnectCode,
  logCrownprintConfigOnce,
  returnUrl,
  siteOrigin,
} from "../../../lib/crownprint";

// Secure handoff endpoint for Shop by CrownPrint™. Not indexable (see robots.ts)
// and never linked as content. All top-level GET redirects so the cookies set
// here stick. Jobs:
//
//   ?start=connect            → send an existing-CrownPrint shopper to HWL to
//                               re-verify and mint a fresh one-time connect code
//   ?start=create             → send a no-CrownPrint shopper to the HWL assessment
//   ?start=refresh            → send a stale-CrownState shopper to the HWL refresh
//   (return from HWL with ?code=…) → verify CSRF, exchange the code ONCE, store a
//                               Wynn-side session, discard the code
//   ?disconnect=1             → clear the Wynn session
//
// The opaque one-time code is exchanged exactly once and never stored; only the
// resulting consumer-safe context is kept, in a Wynn-side session. No CrownPrint
// data is ever placed in a query parameter.
export const dynamic = "force-dynamic";

const LANDING = "/shop-by-crownprint";

export async function GET(request: Request) {
  // Cold-start only (guarded inside): logs the resolved HWL destinations, never
  // anything from this request — no code, session id, cookie or signature.
  logCrownprintConfigOnce();

  const url = new URL(request.url);
  const origin = await siteOrigin();
  const landing = (params = "") => NextResponse.redirect(`${origin}${LANDING}${params}`, { status: 303 });

  // Disconnect: forget this device's Wynn CrownPrint session.
  if (url.searchParams.get("disconnect")) {
    await clearMatchSession();
    return landing("?status=disconnected");
  }

  // Outbound: send the shopper to the appropriate HWL flow.
  const start = url.searchParams.get("start");
  if (start) {
    const flow = start === "create" ? "create" : start === "refresh" || start === "update" ? "refresh" : "connect";
    const redirect = await buildOutboundRedirect(flow);
    if (!redirect) return landing("?status=unavailable"); // not configured → explicit state, never fake data
    return NextResponse.redirect(redirect, { status: 303 });
  }

  // Inbound: HWL returns carrying ONLY the opaque one-time code.
  const code = url.searchParams.get("code");
  if (!code) return landing("?status=cancelled");

  // CSRF: this browser must have initiated the connect within the window.
  if (!(await consumePending())) return landing("?status=error");

  // Exchange the code EXACTLY ONCE. HWL atomically redeems it; after this the
  // code is dead and we never touch it again.
  const result = await exchangeConnectCode(code, returnUrl(origin));
  if (!result.ok) {
    // Distinct, honest outcomes — never "you don't have a CrownPrint" for a 503.
    if (result.reason === "expired") return landing("?status=expired");
    if (result.reason === "unavailable") return landing("?status=temporarily_unavailable");
    return landing("?status=error");
  }

  // Persist only the safe context in a Wynn-side session; the code is discarded.
  const stored = await createMatchSession(result.context);
  if (!stored) return landing("?status=temporarily_unavailable");
  return landing("?status=connected");
}
