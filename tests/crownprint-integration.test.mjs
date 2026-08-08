import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const url = (p) => new URL(p, import.meta.url);
const read = (p) => readFile(url(p), "utf8");

// Renders a route through the built vinext worker (same helper as rendered-html).
async function render(path) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

const files = () =>
  Promise.all([
    read("../lib/crownprint.ts"),
    read("../app/shop-by-crownprint/connect/route.ts"),
    read("../app/shop-by-crownprint/page.tsx"),
    read("../app/shop-by-crownprint/CrownPrintExperience.tsx"),
    read("../app/analytics.ts"),
    read("../.env.example"),
    read("../docs/wynn-essentials-integration.md"),
  ]).then(([lib, route, page, client, analytics, env, doc]) => ({ lib, route, page, client, analytics, env, doc }));

// 1 + 3. The HWL one-time code is exchanged exactly once, server-side, and never
// on page render.
test("HWL connect code is exchanged exactly once, server-side only", async () => {
  const { lib, route, page } = await files();
  // Fixed contract endpoint, one exchange implementation, one network call.
  assert.match(lib, /\/api\/integrations\/wynn-essentials\/match/);
  assert.equal((lib.match(/await fetch\(/g) || []).length, 1, "the adapter must make exactly one HWL request");
  // The exchange happens in the connect route (once), not during render.
  assert.equal((route.match(/exchangeConnectCode\(/g) || []).length, 1, "exchange called exactly once in the connect route");
  assert.doesNotMatch(page, /exchangeConnectCode/, "the page must never exchange a code on render");
  // Render reads a Wynn-side session instead of re-contacting HWL.
  assert.match(page, /readMatchSession\(/);
  assert.match(lib, /never re-exchange/i);
});

// 2. The same code is never reused: only the resulting context is stored, keyed
// by an opaque session id — the code itself is never persisted.
test("Wynn stores only the safe context, never the connect code", async () => {
  const { lib, route } = await files();
  assert.match(route, /createMatchSession\(result\.context\)/, "store the exchanged context, not the code");
  assert.match(lib, /SESSION_COOKIE, await packSigned\(id/, "session cookie carries an opaque id");
  // The code is read once and passed straight to the exchange — never to storage.
  assert.match(route, /const code = url\.searchParams\.get\("code"\)/);
  assert.doesNotMatch(route, /createMatchSession\([^)]*code/, "the code must never be persisted");
  assert.doesNotMatch(lib, /set\([^)]*\bcode\b/, "the code must never be written to a cookie");
});

// 4. The exact HMAC request contract (no Bearer).
test("exchange is HMAC-SHA256 signed with the exact header/message contract", async () => {
  const { lib, doc } = await files();
  assert.match(lib, /`\$\{timestamp\}\.\$\{rawBody\}`/, 'signs "<timestamp>.<rawBody>"');
  assert.match(lib, /name:\s*"HMAC",\s*hash:\s*"SHA-256"/);
  assert.match(lib, /WYNN_INTEGRATION_HMAC_SECRET/);
  assert.match(lib, /"X-Wynn-Timestamp":/);
  assert.match(lib, /"X-Wynn-Signature":/);
  assert.match(lib, /encoding === "hex"/, "signature is hex-encoded");
  // The same message construction and headers are documented for HWL.
  assert.match(doc, /<timestamp>\.<rawBody>/);
  assert.match(doc, /X-Wynn-Timestamp/);
  assert.match(doc, /X-Wynn-Signature/);
});

// 5. No Bearer service token anywhere (checks real usage, not prose).
test("no Bearer service token is used or required", async () => {
  const { lib, env } = await files();
  assert.doesNotMatch(lib, /Authorization["'`]?\s*:/, "no Authorization header is sent");
  assert.doesNotMatch(lib, /Bearer \$\{|Bearer \$|["'`]Bearer /, "no Bearer token is constructed");
  assert.doesNotMatch(lib, /HWL_SERVICE_TOKEN/);
  assert.doesNotMatch(env, /^HWL_SERVICE_TOKEN=/m);
  assert.doesNotMatch(env, /^HWL_MATCH_PATH=/m);
  assert.match(env, /^WYNN_INTEGRATION_HMAC_SECRET=/m);
});

// 6. Expiry / replay handled cleanly and mapped to distinct outcomes.
test("connect-code expiry and replay are handled cleanly", async () => {
  const { lib, route } = await files();
  assert.match(lib, /res\.status === 404 \|\| res\.status === 409 \|\| res\.status === 410/);
  assert.match(lib, /reason:\s*"expired"/);
  assert.match(lib, /res\.status === 503/);
  assert.match(lib, /reason:\s*"unavailable"/);
  assert.match(route, /status=expired/);
  assert.match(route, /status=temporarily_unavailable/);
});

// 7 + 8. Refresh and create each go out to their own HWL flow, which mints a NEW
// one-time code that Wynn exchanges once (Wynn never reuses a prior code).
test("create and refresh flows each obtain a fresh code", async () => {
  const { lib, route, page } = await files();
  assert.match(page, /start=create/);
  assert.match(page, /start=refresh/);
  assert.match(route, /buildOutboundRedirect\(flow\)/);
  // Each flow resolves its own HWL destination (via hwlFlowUrl), and every
  // outbound redirect mints a fresh pending/CSRF marker before leaving.
  assert.match(lib, /if \(flow === "create"\) return crownprintConfig\.assessmentUrl/);
  assert.match(lib, /crownprintConfig\.crownstateUpdateUrl/);
  assert.match(lib, /const base = hwlFlowUrl\(flow\)/);
  assert.match(lib, /await issuePending\(\)/);
  // There is no stored code to reuse — the only persisted artifact is the context.
  assert.doesNotMatch(lib, /reuse|reusable credential.*code/i);
});

// 9. INTEGRATION_UNAVAILABLE, TEMPORARILY_UNAVAILABLE, and NO_CROWNPRINT are
// distinct states.
test("integration_unavailable is distinct from temporarily-unavailable and no-crownprint", async () => {
  const { client } = await files();
  assert.match(client, /!integrationReady/);
  assert.match(client, /available just yet/i);                 // INTEGRATION_UNAVAILABLE
  assert.match(client, /temporarily unavailable/i);            // TEMPORARILY_UNAVAILABLE (503)
  assert.match(client, /status === "temporarily_unavailable"/);
  assert.match(client, /Create your CrownPrint/);              // NO_CROWNPRINT
});

// 10. No prohibited HWL data can enter Wynn state or analytics.
test("no prohibited HWL data enters Wynn state or analytics", async () => {
  const { lib, client } = await files();
  // The boundary never READS prohibited fields off the wire.
  assert.doesNotMatch(lib, /raw\.(userUuid|scores?|weights?|thresholds?|reasonCodes?|axis|crownHistory|report|evidence)/i);
  // Analytics only ever carries a product identifier. Inspect the object argument
  // (if any) of every event call — the event NAME may contain "crownstate", so we
  // only check keys of a passed object literal, never the name string.
  const calls = client.match(/trackCrownPrintEvent\([^)]*\)/g) || [];
  assert.ok(calls.length > 0, "expected CrownPrint analytics calls");
  for (const call of calls) {
    const obj = call.match(/\{[^}]*\}/);
    if (obj) {
      assert.match(obj[0], /contentId:/, `only contentId may be sent: ${call}`);
      assert.doesNotMatch(obj[0], /\b(why|priority|crownState|score|weight|answer|ruleVersion|context)\s*:/i, `prohibited data in analytics: ${call}`);
    }
  }
  // Wynn never reads HWL's connect-code secret (documenting it as HWL-only in a
  // comment is fine; using it is not).
  assert.doesNotMatch(lib, /process\.env\.WYNN_CONNECT_TOKEN_SECRET/);
});

// Behavioral: with HWL unconfigured, the live page shows the explicit
// integration-unavailable state and never fabricates matches.
test("unconfigured integration renders the explicit unavailable state, not fake matches", async () => {
  const res = await render("/shop-by-crownprint");
  assert.equal(res.status, 200);
  const html = await res.text();
  // Indexable educational content is present.
  assert.match(html, /Your hair needs more than a porosity label/);
  assert.match(html, /CrownPrint Core/);
  // Explicit unavailable state, and NO fabricated match cards.
  assert.match(html, /isn.t available just yet/i);
  assert.doesNotMatch(html, /Strong Wynn Essentials Match/);
  assert.doesNotMatch(html, /CURRENT HAIR PRIORITY/);
});

// ---------------------------------------------------------------------------
// Connect vs. Create: two DISTINCT destinations.
//
// Regression guard for the reported loop, where "I already have my CrownPrint"
// bounced the shopper straight back to /shop-by-crownprint. Root cause was
// buildOutboundRedirect() returning null (an optional HWL_* env var was unset),
// which the connect route turns into `landing("?status=unavailable")`.
// ---------------------------------------------------------------------------

test("create and connect CTAs point at different flows, never the same URL", async () => {
  const { page, client } = await files();
  // The page mints separate start= URLs...
  assert.match(page, /connect:\s*`\$\{CANONICAL\}\/connect\?start=connect`/);
  assert.match(page, /create:\s*`\$\{CANONICAL\}\/connect\?start=create`/);
  // ...and the two CTAs consume the two different ones.
  assert.match(client, /href=\{urls\.create\}[\s\S]{0,160}Create My CrownPrint/);
  assert.match(client, /href=\{urls\.connect\}[\s\S]{0,160}Connect My CrownPrint/);
  // The connect CTA must never be wired to the landing page or the create flow.
  assert.doesNotMatch(client, /href="\/shop-by-crownprint"/);
});

test("every outbound flow resolves from HWL_API_BASE_URL, so one unset optional env can't dead-end a CTA", async () => {
  const { lib } = await files();
  // Fixed contract paths exist for all three flows.
  assert.match(lib, /const CONNECT_PATH = "\/crownprint\/connect"/);
  assert.match(lib, /const CREATE_PATH = "\/crownprint"/);
  assert.match(lib, /const CROWNSTATE_PATH = "\/crownstate"/);
  // Optional env overrides fall back to the base URL rather than yielding null.
  assert.match(lib, /crownprintConfig\.assessmentUrl \|\| \(base \? `\$\{base\}\$\{CREATE_PATH\}`/);
  assert.match(lib, /crownprintConfig\.crownstateUpdateUrl \|\| \(base \? `\$\{base\}\$\{CROWNSTATE_PATH\}`/);
  // A genuinely missing prerequisite is logged, not silently swallowed.
  assert.match(lib, /HWL_API_BASE_URL is not set/);
  assert.match(lib, /WYNN_SESSION_SECRET is not set/);
});

test("create flow targets the paid CrownPrint landing, not the gated assessment route", async () => {
  const { lib } = await files();
  // CrownPrint is a paid HWL product: send shoppers to the purchase/landing
  // page. /crownprint-quiz is entitlement-gated at HWL and must not be the
  // default create destination.
  assert.match(lib, /CREATE_PATH = "\/crownprint"/);
  assert.doesNotMatch(lib, /CREATE_PATH = "\/crownprint-quiz"/);
});

test("outbound redirect carries only the validated return URL — no CrownPrint data", async () => {
  const { lib } = await files();
  const fn = lib.slice(lib.indexOf("export async function buildOutboundRedirect"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  const params = body.match(/searchParams\.set\("([^"]+)"/g) || [];
  assert.deepEqual(
    params.map((p) => p.match(/"([^"]+)"/)[1]).sort(),
    ["return", "source"],
    "only `return` and `source` may cross to HWL",
  );
});

// ---------------------------------------------------------------------------
// Page shell: the brand bar must share the content column's gutters.
// ---------------------------------------------------------------------------

test("legal-page chrome gets the shared container gutters instead of sitting at the viewport edge", async () => {
  const css = await read("../app/globals.css");
  // .legal-page is a bare flex column, so its chrome children need the gutter.
  assert.match(
    css,
    /\.legal-page>\.pdp-bar,\s*\.legal-page>\.pdp-crumbs,\s*\.legal-page>\.pdp-footer\{[^}]*padding-left:clamp\(18px,4vw,48px\)/,
    "header/breadcrumb/footer need the shared responsive gutter on .legal-page",
  );
  // Shop by CrownPrint aligns its chrome to its own 1120px content column.
  assert.match(css, /\.cp-page>\.pdp-bar,[\s\S]{0,120}max-width:1120px/);
  // The product-page container is untouched (no regression on /products/*).
  assert.match(css, /\.pdp\{max-width:1240px;margin:0 auto;padding:0 clamp\(18px,4vw,48px\) 60px/);
});
