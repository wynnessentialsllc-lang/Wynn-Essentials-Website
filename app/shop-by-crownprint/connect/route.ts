import { NextResponse } from "next/server";
import {
  buildOutboundRedirect,
  clearMatchSession,
  consumePending,
  createMatchSession,
  deriveContextStatus,
  exchangeConnectCode,
  parseConnectStatus,
  returnUrl,
  siteOrigin,
} from "../../../lib/crownprint";

// Secure handoff endpoint for Shop by CrownPrint™. Not indexable (see robots.ts)
// and never linked as content. All top-level GET redirects so the cookies set
// here stick. Jobs:
//
//   ?start=connect            → send the shopper to HWL /crownprint/connect so HWL
//                               can resolve their ACTUAL state (auth → entitlement
//                               → completed assessment → CrownState) and mint a
//                               one-time code only if they are match-ready
//   ?start=create             → send a no-CrownPrint shopper to the paid HWL flow
//   ?start=refresh            → send a stale-CrownState shopper to the HWL refresh
//   (return from HWL)         → either ?code=… (match-ready: exchange ONCE) or
//                               ?status=… (NO_CROWNPRINT / AUTH_REQUIRED /
//                               CROWNSTATE_STALE / TEMPORARILY_UNAVAILABLE)
//   ?disconnect=1             → clear the Wynn session
//
// EVERY return path ends on /shop-by-crownprint?state=<enum>, and the page
// renders a distinct panel per state. Nothing lands on the generic intro without
// an explanation — that unexplained bounce was the connect loop this endpoint
// exists to end.
//
// The opaque one-time code is exchanged exactly once and never stored; only the
// resulting consumer-safe context is kept, in a Wynn-side session. No CrownPrint
// data is ever placed in a query parameter — the state enum is the only thing
// that crosses, and it says nothing about answers, scores, or identity.
export const dynamic = "force-dynamic";

const LANDING = "/shop-by-crownprint";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = await siteOrigin();
  const landing = (state: string) => NextResponse.redirect(`${origin}${LANDING}?state=${state}`, { status: 303 });

  // Disconnect: forget this device's Wynn CrownPrint session.
  if (url.searchParams.get("disconnect")) {
    await clearMatchSession();
    return landing("DISCONNECTED");
  }

  // Outbound: send the shopper to the appropriate HWL flow. `connect` is the
  // resolver — HWL decides there whether this person actually has a CrownPrint.
  const start = url.searchParams.get("start");
  if (start) {
    const flow = start === "create" ? "create" : start === "refresh" || start === "update" ? "refresh" : "connect";
    const redirect = await buildOutboundRedirect(flow);
    if (!redirect) return landing("INTEGRATION_UNAVAILABLE"); // not configured → explicit state, never fake data
    return NextResponse.redirect(redirect, { status: 303 });
  }

  // Inbound. HWL returns EITHER a one-time code (match-ready) OR a status that
  // tells us why there is no code. A status is accepted under several parameter
  // names so a naming difference on the HWL side can't silently degrade into the
  // old unexplained bounce.
  const code = url.searchParams.get("code");
  const status = parseConnectStatus(
    url.searchParams.get("status") ?? url.searchParams.get("state") ?? url.searchParams.get("result"),
  );

  if (!code) {
    if (!status) {
      // No code and no claim — the shopper backed out of the HWL flow.
      await consumePending();
      return landing("CANCELLED");
    }
    await consumePending(); // one outbound hop, one return; clear the CSRF marker
    console.info(`[crownprint] HWL resolved this shopper as ${status}.`);
    // The shopper is not match-ready, so any session from an earlier visit must
    // go: an entitlement can be refunded or revoked, and a signed-out or
    // CrownPrint-less shopper must never keep seeing old matches.
    if (status === "NO_CROWNPRINT" || status === "AUTH_REQUIRED") await clearMatchSession();
    // MATCH_READY with no code is a contract violation, not a verdict about the
    // shopper. Report it as unavailable — never as "you have no CrownPrint".
    if (status === "MATCH_READY") {
      console.error("[crownprint] HWL returned MATCH_READY without a connect code.");
      return landing("TEMPORARILY_UNAVAILABLE");
    }
    return landing(status);
  }

  /*
   * WHICH JOURNEY IS THIS?
   *
   * The pending-cookie check below is a CSRF marker: it proves the browser that
   * came back is the one WE sent out. That is meaningful only for a journey
   * WYNN started. For a journey Hair Wellness Lab started — a shopper clicking
   * "Shop products for my CrownPrint" on their paid HWL report — Wynn was never
   * visited before this callback, so no outbound hop happened here and no
   * pending cookie could exist. Requiring one made the primary paid-report CTA
   * fail on its first click by design, with SESSION_LOST.
   *
   * HWL now states the journey's origin explicitly on the return contract.
   * We read it; we never infer it from the absence of state, which is how this
   * class of bug gets rediscovered.
   *
   * `flow` IS NOT AUTHORIZATION. It selects which callback-state rule applies
   * and nothing else. Trust still comes from the one-time code, the HMAC
   * exchange, and HWL's entitlement check — all unchanged below, and all
   * equally required on both branches.
   */
  const flowParam = url.searchParams.get("flow");
  const flow: "wynn_initiated" | "hwl_initiated" | "unknown" =
    flowParam === "wynn_initiated" ? "wynn_initiated"
      : flowParam === "hwl_initiated" ? "hwl_initiated"
        : "unknown";

  /*
   * Unknown or absent → the STRICTER rule, never the weaker one.
   *
   * Failing closed here means applying Wynn-initiated validation, not refusing
   * outright: an HWL-initiated journey is refused exactly as it is today, while
   * a legitimate Wynn-initiated journey from a deploy that predates `flow`
   * keeps working. Nothing is inferred to be HWL-initiated, ever — the only way
   * to skip the pending check is for HWL to say so in as many words.
   */
  const requirePendingState = flow !== "hwl_initiated";

  if (flow === "unknown") {
    console.warn(
      `[crownprint] Connect code arrived with ${flowParam === null ? "no" : `an unrecognised (${flowParam})`} flow marker. ` +
        "Applying Wynn-initiated validation. If this is a paid-report CTA it will be refused — check that HWL is deployed with the flow contract.",
    );
  }

  if (requirePendingState) {
    // CSRF: this browser must have initiated the connect within the window. The
    // check is absolute for a Wynn-initiated journey — a code that arrives
    // without a valid pending marker is NEVER exchanged — but the two ways it
    // can fail need different recovery copy, and both need to be visible in the
    // logs. Neither outcome asks the shopper to pay again or to retake the
    // assessment.
    const pending = await consumePending();
    if (pending !== "ok") {
      console.error(
        pending === "missing"
          ? `[crownprint] Connect code arrived with NO pending cookie on a ${flow} journey. Refusing the exchange. Common causes: the return URL landed on a different host than the outbound hop (bare vs www, or a preview domain), third-party cookie blocking, or the HWL flow was finished in another browser. Return host: ${url.host}.`
          : "[crownprint] Connect code arrived with an invalid or expired pending cookie. Refusing the exchange. The 15-minute window elapsed, or WYNN_SESSION_SECRET changed between the two hops.",
      );
      return landing(pending === "missing" ? "SESSION_LOST" : "EXPIRED");
    }
  } else {
    /*
     * HWL-initiated: there is no pending marker to consume, and its absence is
     * expected rather than suspicious. Clear any stale one so a later
     * Wynn-initiated journey cannot reuse a marker this hop left behind.
     */
    await consumePending();
    console.info("[crownprint] HWL-initiated journey; no Wynn pending state expected. Authorization is the one-time code.");
  }

  // Exchange the code EXACTLY ONCE. HWL atomically redeems it; after this the
  // code is dead and we never touch it again.
  const result = await exchangeConnectCode(code, returnUrl(origin));
  if (!result.ok) {
    // Distinct, honest outcomes — never "you don't have a CrownPrint" for a 503.
    if (result.reason === "expired") return landing("EXPIRED");
    if (result.reason === "unavailable") return landing("TEMPORARILY_UNAVAILABLE");
    return landing("ERROR");
  }

  // Trust the context, not the fact that a code arrived: HWL may hand back a
  // context whose entitlement is inactive or whose assessment is incomplete.
  // Entitlement is the gate, so that resolves to NO_CROWNPRINT, not to matches.
  const resolved = deriveContextStatus(result.context);
  // Counts only — enough to see at a glance how complete the resolved 360
  // context was, without a single CrownPrint value crossing into the logs.
  const ctx = result.context;
  console.info(
    `[crownprint] Exchange succeeded; context resolved as ${resolved}. ` +
      `code: ${ctx.crownPrintCode ? "present" : "absent"} · ` +
      `crownState: ${ctx.crownState.present ? (ctx.crownState.fresh ? "fresh" : "stale") : "absent"} · ` +
      `priorities: ${ctx.currentPriorities?.length ?? 0} · ` +
      `functions: ${ctx.productFunctionsNeeded?.length ?? 0} · ` +
      `matches: ${ctx.matches.length} · ` +
      `notCarried: ${ctx.notCarried?.length ?? 0}`,
  );
  if (resolved === "NO_CROWNPRINT") {
    await clearMatchSession();
    return landing("NO_CROWNPRINT");
  }

  // Persist only the safe context in a Wynn-side session; the code is discarded.
  const stored = await createMatchSession(result.context);
  if (!stored) return landing("TEMPORARILY_UNAVAILABLE");
  // MATCH_READY → results. CROWNSTATE_STALE → results plus the update prompt.
  return landing(resolved);
}
