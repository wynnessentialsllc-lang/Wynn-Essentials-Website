import { NextResponse } from "next/server";
import {
  buildHwlRedirect,
  clearHandoff,
  consumeState,
  setHandoff,
  siteOrigin,
} from "../../../lib/crownprint";

// Secure handoff endpoint for Shop by CrownPrint™. It is deliberately NOT
// indexable (see robots.ts) and is never linked as content. It handles three
// jobs, all as top-level GET redirects so cookies set here stick:
//
//   ?start=create            → send the shopper to the HWL CrownPrint assessment
//   ?start=update            → send the shopper to the HWL CrownState update flow
//   (return from HWL w/ token & state) → verify, store signed handoff cookie
//   ?disconnect=1            → clear the handoff cookie
//
// No CrownPrint answers ever pass through here — only an opaque handoff token
// issued by HWL, verified against a CSRF state, and stored httpOnly.
export const dynamic = "force-dynamic";

const LANDING = "/shop-by-crownprint";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = await siteOrigin();
  const landing = (params = "") => NextResponse.redirect(`${origin}${LANDING}${params}`, { status: 303 });

  // Disconnect: forget this device's CrownPrint link.
  if (url.searchParams.get("disconnect")) {
    await clearHandoff();
    return landing("?status=disconnected");
  }

  const start = url.searchParams.get("start");
  if (start) {
    const flow = start === "update" ? "update" : "create";
    // No HWL flow configured → explicit "unavailable" state (never fake data).
    const redirect = await buildHwlRedirect(flow);
    if (!redirect) return landing("?status=unavailable");
    return NextResponse.redirect(redirect, { status: 303 });
  }

  // Otherwise this is a return from HWL carrying an opaque handoff token.
  const token =
    url.searchParams.get("token") ||
    url.searchParams.get("handoff") ||
    url.searchParams.get("crownprint_token");
  const state = url.searchParams.get("state");

  if (!token) return landing("?status=cancelled");

  // Verify the CSRF state we issued on the outbound hop. This one-time state is
  // consumed regardless of outcome.
  const ok = await consumeState(state);
  if (!ok) return landing("?status=error");

  await setHandoff(token.slice(0, 4096));
  return landing("?status=connected");
}
