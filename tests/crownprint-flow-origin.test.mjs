// Environment first: the route reads its configuration at module scope, and
// `import` declarations hoist above assignments, so the route is imported
// dynamically further down.
process.env.HWL_API_BASE_URL = "https://hairwellnessslab.com";
process.env.WYNN_INTEGRATION_HMAC_SECRET = "test-only-shared-secret-not-a-real-one";
process.env.WYNN_SESSION_SECRET = "test-only-session-secret-at-least-16";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { afterEach, beforeEach } from "node:test";

import { requestScope } from "./next-headers-stub.mjs";
import { reset as resetSessionStore } from "./crownprint-session-store-stub.mjs";

/**
 * The production Gate 1 failure, and the rule that fixes it.
 *
 * ── What happened ───────────────────────────────────────────────────────────
 *
 * A shopper on an authenticated, PAID Hair Wellness Lab report clicked
 * "Shop products for my CrownPrint". The handoff reached this callback and we
 * refused it:
 *
 *   "That link came back without the browser session that started it, so we
 *    stopped rather than trust it."
 *
 * That is SESSION_LOST — the `pending` cookie check.
 *
 * ── Why it was wrong ────────────────────────────────────────────────────────
 *
 * The pending cookie is a CSRF marker proving the browser that came back is the
 * one WE sent out. It exists only when WYNN started the journey. On an
 * HWL-initiated journey Wynn is never visited before the callback, so there was
 * no outbound hop here and no cookie could exist. Requiring one made the
 * primary paid-report CTA fail on its first click, by design.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *
 * HWL states the journey's origin on the return contract. We read it:
 *
 *   flow=wynn_initiated  → pending state required, fail closed without it
 *   flow=hwl_initiated   → no pending state expected; the one-time code is it
 *   missing / unknown    → the STRICTER rule, never the weaker one
 *
 * `flow` IS NOT AUTHORIZATION. It selects which callback-state rule applies.
 * Trust comes from the one-time code, the HMAC exchange and HWL's entitlement
 * check — unchanged, and equally required on both branches. The behavioural
 * tests below drive the real handler to prove that, because a bug that a
 * source-shape assertion could have caught is not the bug we had.
 */

const { GET } = await import("../app/shop-by-crownprint/connect/route.ts");
const { issuePending } = await import("../lib/crownprint.ts");

// ─── Harness ────────────────────────────────────────────────────────────────

/** A match-ready HWL response: paid entitlement, completed assessment, matches. */
const matchReadyBody = (overrides = {}) => ({
  crownPrintPresent: true,
  entitlementActive: true,
  entitlementStatus: "active",
  assessmentComplete: true,
  resultsReady: true,
  crownState: { present: true, fresh: true },
  currentPriorityLabel: "Moisture retention after takedown",
  matches: [
    { productKey: "hydrating-leave-in", productName: "Hydrating Leave-In", matchClass: "strong", why: "Layers moisture without heaviness." },
  ],
  ...overrides,
});

let realFetch;
/** Every exchange request the handler actually sent, in order. */
let exchanges;

/**
 * Stand in for Hair Wellness Lab. `respond` receives the parsed request and
 * returns a Response; the default is a match-ready 200.
 */
function stubHwl(respond) {
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    exchanges.push({
      url,
      method: init.method,
      timestamp: init.headers?.["X-Wynn-Timestamp"],
      signature: init.headers?.["X-Wynn-Signature"],
      body: JSON.parse(init.body),
    });
    return respond ? respond(exchanges.at(-1)) : Response.json(matchReadyBody());
  };
}

beforeEach(() => {
  realFetch = globalThis.fetch;
  exchanges = [];
  resetSessionStore();
  stubHwl();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const CALLBACK = "https://wynnessentialsllc.us/shop-by-crownprint/connect";

/** Drive the real handler through one simulated request. */
const REQUEST_HEADERS = { host: "wynnessentialsllc.us", "x-forwarded-proto": "https" };

async function callback(query, { cookies = {} } = {}) {
  const { result, cookies: after } = await requestScope({ cookies, headers: REQUEST_HEADERS }, () =>
    GET(new Request(`${CALLBACK}?${new URLSearchParams(query)}`)),
  );
  const location = new URL(result.headers.get("location"));
  return {
    status: result.status,
    state: location.searchParams.get("state"),
    location,
    cookies: after,
    /** True once the exchanged context is held in a Wynn session. */
    connected: Boolean(after.we_crownprint_session),
  };
}

/** A genuine pending cookie, minted by the same code the outbound hop runs. */
async function mintedPendingCookie() {
  const { cookies } = await requestScope({}, () => issuePending());
  return cookies;
}

// ════════════════════════════════════════════════════════════════════════════
// THE PRODUCTION FAILURE, REPRODUCED AND FIXED
// ════════════════════════════════════════════════════════════════════════════

test("cold browser · paid HWL report CTA · flow=hwl_initiated → personalized results", async () => {
  // No Wynn cookies whatsoever. This shopper has never been to Wynn in this
  // browser; their first contact with it is this callback.
  const r = await callback(
    { status: "match_ready", code: "one-time-code-abc", crownprint_code: "one-time-code-abc", flow: "hwl_initiated" },
    { cookies: {} },
  );

  assert.notEqual(r.state, "SESSION_LOST", "the exact production refusal must not recur");
  assert.equal(r.state, "MATCH_READY");
  assert.equal(r.status, 303);
  assert.equal(r.location.pathname, "/shop-by-crownprint");
  assert.equal(r.connected, true, "the exchanged context must be held in a Wynn session");
  assert.equal(exchanges.length, 1, "the code must be exchanged exactly once");
  assert.equal(exchanges[0].body.code, "one-time-code-abc");
});

test("the same cold browser WITHOUT the marker is still refused — the marker is the fix", async () => {
  // Production today. Identical request, `flow` absent, and the handoff dies
  // before the exchange with the message the shopper reported.
  const r = await callback({ status: "match_ready", code: "one-time-code-abc" }, { cookies: {} });

  assert.equal(r.state, "SESSION_LOST");
  assert.equal(exchanges.length, 0, "a refused handoff must not spend the code");
  assert.equal(r.connected, false);
});

// ════════════════════════════════════════════════════════════════════════════
// 1–2 · THE WYNN-INITIATED JOURNEY IS UNCHANGED
// ════════════════════════════════════════════════════════════════════════════

test("1. wynn_initiated with a valid pending cookie succeeds", async () => {
  const r = await callback(
    { status: "match_ready", code: "code-xyz", flow: "wynn_initiated" },
    { cookies: await mintedPendingCookie() },
  );

  assert.equal(r.state, "MATCH_READY");
  assert.equal(r.connected, true);
  assert.equal(exchanges.length, 1);
});

test("2. wynn_initiated with a missing pending cookie fails closed", async () => {
  const r = await callback({ status: "match_ready", code: "code-xyz", flow: "wynn_initiated" }, { cookies: {} });

  assert.equal(r.state, "SESSION_LOST");
  assert.equal(exchanges.length, 0, "the CSRF refusal must precede the exchange");
  assert.equal(r.connected, false);
});

test("2b. wynn_initiated with a tampered pending cookie fails closed, and says so differently", async () => {
  const pending = await mintedPendingCookie();
  const [payload, expiry] = pending.we_cp_pending.split(".");
  const r = await callback(
    { status: "match_ready", code: "code-xyz", flow: "wynn_initiated" },
    { cookies: { we_cp_pending: `${payload}.${expiry}.forged-signature` } },
  );

  assert.equal(r.state, "EXPIRED", "a forged marker is not the same problem as an absent one");
  assert.equal(exchanges.length, 0);
});

test("the pending cookie is single-use — a valid one is consumed, not left to be replayed", async () => {
  const pending = await mintedPendingCookie();
  const first = await callback({ status: "match_ready", code: "code-1", flow: "wynn_initiated" }, { cookies: pending });
  assert.equal(first.state, "MATCH_READY");
  assert.ok(!first.cookies.we_cp_pending, "the marker must be cleared on the return hop");
});

// ════════════════════════════════════════════════════════════════════════════
// 3–4 · THE CODE IS THE CREDENTIAL ON THE HWL-INITIATED BRANCH TOO
// ════════════════════════════════════════════════════════════════════════════

test("3. hwl_initiated with no state and a valid code succeeds", async () => {
  const r = await callback({ status: "match_ready", code: "valid-code", flow: "hwl_initiated" }, { cookies: {} });
  assert.equal(r.state, "MATCH_READY");
  assert.equal(r.connected, true);
});

test("4a. hwl_initiated with an already-redeemed code is refused", async () => {
  // HWL answers 409 for a code it has already spent. Replay must not connect.
  stubHwl(() => new Response("", { status: 409 }));
  const r = await callback({ status: "match_ready", code: "replayed-code", flow: "hwl_initiated" }, { cookies: {} });

  assert.equal(r.state, "EXPIRED");
  assert.equal(r.connected, false, "a replayed code must not produce a session");
});

test("4b. hwl_initiated with an expired code is refused", async () => {
  stubHwl(() => new Response("", { status: 410 }));
  const r = await callback({ status: "match_ready", code: "stale-code", flow: "hwl_initiated" }, { cookies: {} });
  assert.equal(r.state, "EXPIRED");
  assert.equal(r.connected, false);
});

test("4c. hwl_initiated with a code HWL has never seen is refused", async () => {
  stubHwl(() => new Response("", { status: 404 }));
  const r = await callback({ status: "match_ready", code: "invented-code", flow: "hwl_initiated" }, { cookies: {} });
  assert.equal(r.state, "EXPIRED");
  assert.equal(r.connected, false);
});

test("a code exchanged once is never exchanged again on a second visit", async () => {
  const first = await callback({ status: "match_ready", code: "single-use", flow: "hwl_initiated" }, { cookies: {} });
  assert.equal(first.state, "MATCH_READY");
  // The shopper reloads the callback URL. HWL has spent the code, so it 409s —
  // and Wynn asks HWL again rather than trusting the code a second time itself.
  stubHwl(() => new Response("", { status: 409 }));
  const second = await callback({ status: "match_ready", code: "single-use", flow: "hwl_initiated" }, { cookies: {} });
  assert.equal(second.state, "EXPIRED");
  assert.equal(second.connected, false, "a reload must not mint a second session from a spent code");
  // Two visits, two asks. Wynn never decides for itself that a code it has seen
  // before is still good — single use is HWL's ruling, requested every time.
  assert.equal(exchanges.length, 2);
  assert.deepEqual(exchanges.map((e) => e.body.code), ["single-use", "single-use"]);
});

// ════════════════════════════════════════════════════════════════════════════
// 5 · UNKNOWN OR MISSING flow FAILS CLOSED
// ════════════════════════════════════════════════════════════════════════════

for (const marker of [
  { label: "absent", query: {} },
  { label: "empty", query: { flow: "" } },
  { label: "unrecognised", query: { flow: "somebody_else_initiated" } },
  { label: "case-shifted", query: { flow: "HWL_INITIATED" } },
  { label: "padded", query: { flow: " hwl_initiated" } },
  { label: "prefixed", query: { flow: "not_hwl_initiated" } },
]) {
  test(`5. an ${marker.label} flow marker applies the stricter rule`, async () => {
    const r = await callback({ status: "match_ready", code: "code-xyz", ...marker.query }, { cookies: {} });
    assert.equal(r.state, "SESSION_LOST", `"${marker.query.flow ?? ""}" must not be read as hwl_initiated`);
    assert.equal(exchanges.length, 0);
  });
}

test("5b. a repeated flow parameter cannot smuggle the weaker rule past the stricter one", async () => {
  const { result } = await requestScope({ cookies: {} }, () =>
    GET(new Request(`${CALLBACK}?status=match_ready&code=c&flow=wynn_initiated&flow=hwl_initiated`)),
  );
  // URLSearchParams.get returns the FIRST value, so the first marker wins and
  // the second cannot override it into the branch that skips the check.
  assert.equal(new URL(result.headers.get("location")).searchParams.get("state"), "SESSION_LOST");
  assert.equal(exchanges.length, 0);
});

// ════════════════════════════════════════════════════════════════════════════
// 6 · flow CANNOT BYPASS HMAC, ENTITLEMENT, OR THE ORIGIN CONTRACT
// ════════════════════════════════════════════════════════════════════════════

test("6a. hwl_initiated still signs the exchange exactly as wynn_initiated does", async () => {
  await callback({ status: "match_ready", code: "code-a", flow: "hwl_initiated" }, { cookies: {} });
  const hwl = exchanges.at(-1);

  await callback({ status: "match_ready", code: "code-b", flow: "wynn_initiated" }, { cookies: await mintedPendingCookie() });
  const wynn = exchanges.at(-1);

  for (const e of [hwl, wynn]) {
    assert.equal(e.url, "https://hairwellnessslab.com/api/integrations/wynn-essentials/match");
    assert.equal(e.method, "POST");
    assert.match(e.signature, /^[A-Za-z0-9_-]+$/, "base64url, unpadded");
    assert.match(e.timestamp, /^\d{10}$/, "unix seconds");
    assert.equal(e.body.return, "https://wynnessentialsllc.us/shop-by-crownprint/connect");
  }
  assert.equal(hwl.signature.length, wynn.signature.length);
  // And the journey marker is not part of what gets signed or sent.
  assert.deepEqual(Object.keys(hwl.body).sort(), ["code", "return"]);
});

test("6b. HWL refusing the signature is never rescued by the flow marker", async () => {
  stubHwl(() => new Response("", { status: 401 }));
  const r = await callback({ status: "match_ready", code: "code-a", flow: "hwl_initiated" }, { cookies: {} });
  assert.equal(r.state, "ERROR");
  assert.equal(r.connected, false);
});

test("6c. an inactive entitlement still resolves to NO_CROWNPRINT on the hwl_initiated branch", async () => {
  stubHwl(() => Response.json(matchReadyBody({ entitlementActive: false, entitlementStatus: "refunded" })));
  const r = await callback({ status: "match_ready", code: "code-a", flow: "hwl_initiated" }, { cookies: {} });

  assert.equal(r.state, "NO_CROWNPRINT", "entitlement is the gate, not the arrival of a code");
  assert.equal(r.connected, false, "a refunded shopper must not be given a match session");
});

test("6d. an unreachable HWL is reported as unavailable, never as personalized results", async () => {
  stubHwl(() => { throw new Error("network"); });
  const r = await callback({ status: "match_ready", code: "code-a", flow: "hwl_initiated" }, { cookies: {} });
  assert.equal(r.state, "TEMPORARILY_UNAVAILABLE");
  assert.equal(r.connected, false);
});

// ════════════════════════════════════════════════════════════════════════════
// Side effects and leakage
// ════════════════════════════════════════════════════════════════════════════

test("an hwl_initiated hop clears a stale pending marker it did not need", async () => {
  const r = await callback(
    { status: "match_ready", code: "code-a", flow: "hwl_initiated" },
    { cookies: await mintedPendingCookie() },
  );
  assert.equal(r.state, "MATCH_READY");
  assert.ok(
    !r.cookies.we_cp_pending,
    "a marker left behind here could be reused by a later Wynn-initiated journey",
  );
});

test("the journey marker never reaches the landing URL", async () => {
  for (const flow of ["hwl_initiated", "wynn_initiated", "nonsense"]) {
    const r = await callback({ status: "match_ready", code: "c", flow }, { cookies: await mintedPendingCookie() });
    assert.deepEqual([...r.location.searchParams.keys()], ["state"], `${flow} leaked a parameter onto the landing page`);
  }
});

test("no CrownPrint data crosses in a query parameter on either branch", async () => {
  const r = await callback({ status: "match_ready", code: "code-a", flow: "hwl_initiated" }, { cookies: {} });

  // The state enum is the ONLY thing that crosses. It names an outcome — it says
  // nothing about answers, scores, identity, or the code that was just spent.
  assert.deepEqual([...r.location.searchParams], [["state", "MATCH_READY"]]);
  const raw = r.location.toString().toLowerCase();
  for (const banned of ["porosity", "density", "code-a", "code=", "priorit", "product"]) {
    assert.ok(!raw.includes(banned), `${banned} crossed into the landing URL`);
  }
});

test("a return with no code at all is still handled before any flow logic runs", async () => {
  const r = await callback({ status: "no_crownprint", flow: "hwl_initiated" }, { cookies: {} });
  assert.equal(r.state, "NO_CROWNPRINT");
  assert.equal(exchanges.length, 0);
});

// ════════════════════════════════════════════════════════════════════════════
// The shape of the decision, so it cannot be re-derived by inference later
// ════════════════════════════════════════════════════════════════════════════

const url = (p) => new URL(p, import.meta.url);
const read = (p) => readFile(url(p), "utf8");
const route = () => read("../app/shop-by-crownprint/connect/route.ts");

test("the callback reads an explicit flow marker rather than inferring one", async () => {
  const src = await route();
  assert.match(src, /url\.searchParams\.get\("flow"\)/, "the flow marker is never read");
  // The skip is keyed on the affirmative value, never on a missing `state`.
  assert.match(
    src,
    /const requirePendingState = flow !== "hwl_initiated"/,
    "the pending requirement must key on the stated flow",
  );
  assert.doesNotMatch(
    src,
    /searchParams\.get\("state"\)[^\n]*\?[^\n]*pending/i,
    "the pending rule must not be decided by the presence or absence of `state`",
  );
  assert.doesNotMatch(src, /flowParam \?\? "hwl_initiated"/, "no default may manufacture the weaker rule");
});

test("there is exactly one exchange, reachable from both branches", async () => {
  const src = await route();
  assert.equal((src.match(/exchangeConnectCode\(/g) || []).length, 1);
  assert.ok(
    src.indexOf("const requirePendingState") < src.indexOf("exchangeConnectCode("),
    "the flow branch must be resolved before the exchange, not instead of it",
  );
});

test("the flow marker has no influence after the exchange", async () => {
  const src = await route();
  const after = src.slice(src.indexOf("const result = await exchangeConnectCode("));
  assert.doesNotMatch(after.slice(0, after.indexOf("createMatchSession")), /flow/);
});

test("the HMAC exchange contract is untouched", async () => {
  const lib = await read("../lib/crownprint.ts");
  assert.match(lib, /HMAC-SHA256 over "<timestamp>\.<rawBody>"/);
  assert.match(lib, /signExchange\(/);
  assert.equal((lib.match(/await fetch\(/g) || []).length, 1, "still exactly one HWL request");
});

// ─── Gate 2 · the health endpoint can answer the clock question ─────────────

test("the integration health endpoint reports the clock, not just the secret", async () => {
  const src = await read("../app/api/internal/crownprint-integration-health/route.ts");
  assert.match(src, /serverTimeSeconds: Math\.floor\(Date\.now\(\) \/ 1000\)/);
  assert.match(src, /timestampUnit: "seconds"/);
  assert.match(src, /timestampToleranceSeconds: 300/);
  // Still token-gated, still 404 when not configured — the gate is unchanged.
  assert.match(src, /if \(!adminTokenConfigured\(\) \|\| !authorized\(request\)\)/);
  assert.match(src, /new NextResponse\("Not found", \{ status: 404 \}\)/);
});
