import { NextResponse } from "next/server";
import {
  consumePending,
  createMatchSession,
  exchangeConnectCode,
  returnUrl,
  siteOrigin,
} from "../../../lib/crownprint";

// CALLBACK ONLY. This is the exact URL Wynn sends to Hair Wellness Lab as
// `return`, and the only thing it does is redeem the opaque one-time connect
// code HWL sends back:
//
//   (return from HWL with ?code=…) → verify CSRF, exchange the code ONCE, store
//                                    a Wynn-side session, discard the code
//
// It has NO outbound behaviour. Outbound hops live at /shop-by-crownprint/start.
// That separation is deliberate: when one route is both the CTA target and the
// HWL callback, anything HWL round-trips (its own copy of the original query,
// or a bare return with no code) can be re-read as "go to HWL again" or falls
// through to a bare redirect home — either way the shopper ends up back on the
// page they started from and the CTA looks broken.
//
// Not indexable (see robots.ts) and never linked as content. The opaque code is
// exchanged exactly once and never stored; only the consumer-safe context is
// kept, in a Wynn-side session. No CrownPrint data is ever placed in a query
// parameter.
export const dynamic = "force-dynamic";

const LANDING = "/shop-by-crownprint";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = await siteOrigin();
  const landing = (params = "") => NextResponse.redirect(`${origin}${LANDING}${params}`, { status: 303 });

  // Inbound: HWL returns carrying ONLY the opaque one-time code.
  const code = url.searchParams.get("code");
  // No code means this was not a completed HWL connect — the shopper backed out,
  // or HWL sent them back without minting one. Say so explicitly; a bare bounce
  // to the landing page is indistinguishable from the CTA doing nothing.
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
