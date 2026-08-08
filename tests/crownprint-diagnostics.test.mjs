import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Diagnostics for the resolved Hair Wellness Lab destinations. These load the
// shipped lib/crownprint.ts (see tests/hwl-loader.mjs) so the reported URLs are
// the ones the app really uses, not a re-derivation of the route logic.

const HWL = "https://hairwellnessslab.com";
// Built by concatenation so the misspelled host never appears literally in the
// tree (tests/domain-canonical.test.mjs enforces that).
const WRONG_HOST = "hairwellness" + "lab.com";

// Sentinel secret values. If any of these ever reach the summary or a log line,
// the corresponding assertion fails loudly.
const HMAC_SENTINEL = "SENTINEL-hmac-must-never-be-logged";
const SESSION_SENTINEL = "SENTINEL-session-must-never-be-logged";
const SECRET_ENV = ["HWL_API_BASE_URL", "HWL_ASSESSMENT_URL", "HWL_CROWNSTATE_UPDATE_URL", "HWL_PRODUCT_HUB_URL", "WYNN_INTEGRATION_HMAC_SECRET", "WYNN_SESSION_SECRET", "ADMIN_ORDERS_TOKEN"];

async function load(env, { secrets = true } = {}) {
  for (const k of SECRET_ENV) delete process.env[k];
  Object.assign(process.env, env);
  if (secrets) {
    process.env.WYNN_INTEGRATION_HMAC_SECRET = HMAC_SENTINEL;
    process.env.WYNN_SESSION_SECRET = SESSION_SENTINEL;
  }
  return import(`../lib/crownprint.ts?diag=${encodeURIComponent(JSON.stringify(env))}-${secrets}`);
}

// The lines the cold-start report itself emits, as opposed to the per-override
// rejection warnings that hwlUrl() already emitted before this feature existed.
const REPORT_LINE = /^\[crownprint\] (HWL base|create|connect|crownstate|product hub|integration configured|missing config|WARNING)/;

// Runs a module's cold-start logger and returns every line it emitted.
function capture(fn) {
  const lines = [];
  const original = { info: console.info, warn: console.warn, error: console.error };
  for (const level of ["info", "warn", "error"]) {
    console[level] = (...args) => lines.push(args.join(" "));
  }
  try {
    fn();
  } finally {
    Object.assign(console, original);
  }
  return lines;
}

// 1. The canonical production configuration reports all five destinations.
test("canonical production config reports the correct resolved URLs", async () => {
  const m = await load({ HWL_API_BASE_URL: HWL, HWL_PRODUCT_HUB_URL: `${HWL}/product-hub` });
  const s = m.crownprintConfigSummary();

  assert.deepEqual(s.urls, {
    base: HWL,
    create: `${HWL}/crownprint`,
    connect: `${HWL}/crownprint/connect`,
    crownstate: `${HWL}/crownstate`,
    productHub: `${HWL}/product-hub`,
    exchange: `${HWL}/api/integrations/wynn-essentials/match`,
  });
  assert.equal(s.canonicalOrigin, HWL);
  assert.equal(s.productionOriginOk, true);

  const lines = capture(() => m.logCrownprintConfigOnce());
  assert.deepEqual(lines, [
    `[crownprint] HWL base: ${HWL}`,
    `[crownprint] create: ${HWL}/crownprint`,
    `[crownprint] connect: ${HWL}/crownprint/connect`,
    `[crownprint] crownstate: ${HWL}/crownstate`,
    `[crownprint] product hub: ${HWL}/product-hub`,
    `[crownprint] integration configured: true`,
  ]);
});

// The cold-start guard: one process, one report — never per request.
test("the resolved-URL report is logged once per process, not per request", async () => {
  const m = await load({ HWL_API_BASE_URL: HWL });
  assert.ok(capture(() => m.logCrownprintConfigOnce()).length > 0, "first call reports");
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(capture(() => m.logCrownprintConfigOnce()), [], "later calls stay silent");
  }
});

// 2. A trailing slash on the base never reaches the reported URLs.
test("a trailing slash on the base is normalized in the reported URLs", async () => {
  const s = (await load({ HWL_API_BASE_URL: `${HWL}/` })).crownprintConfigSummary();
  assert.equal(s.urls.base, HWL);
  assert.equal(s.urls.connect, `${HWL}/crownprint/connect`);
  assert.equal(s.urls.exchange, `${HWL}/api/integrations/wynn-essentials/match`);
  for (const u of Object.values(s.urls)) assert.doesNotMatch(String(u), /[^:]\/\//, "no double slash");
});

// 3. A rejected override must not appear as the effective URL — the report has
// to show where shoppers actually go, which is the contract-path fallback.
test("a wrong-host override never becomes the reported effective URL", async () => {
  const m = await load({
    HWL_API_BASE_URL: HWL,
    HWL_ASSESSMENT_URL: `https://${WRONG_HOST}/crownprint`,
    HWL_CROWNSTATE_UPDATE_URL: "https://evil.example/crownstate",
    HWL_PRODUCT_HUB_URL: "javascript:alert(1)",
  });
  const s = m.crownprintConfigSummary();

  assert.equal(s.urls.create, `${HWL}/crownprint`, "falls back to the trusted contract path");
  assert.equal(s.urls.crownstate, `${HWL}/crownstate`, "falls back to the trusted contract path");
  assert.equal(s.urls.productHub, null, "Product Hub CTA is omitted, not pointed off-origin");

  // The rejected values must not be echoed as effective destinations. The
  // pre-existing per-override rejection warning DOES name the bad host on
  // purpose — that is the approved diagnostic — so the two are separated here.
  const lines = capture(() => m.logCrownprintConfigOnce());
  const report = lines.filter((l) => REPORT_LINE.test(l));
  const rejections = lines.filter((l) => /points at .* not the trusted HWL origin/.test(l));

  const blob = `${report.join("\n")}\n${JSON.stringify(s)}`;
  for (const bad of [WRONG_HOST, "evil.example", "javascript:"]) {
    assert.ok(!blob.includes(bad), `rejected value "${bad}" must not appear as an effective URL`);
  }
  // The approved rejection warning is still emitted, so a bad override stays
  // diagnosable rather than failing silently.
  assert.ok(
    rejections.some((l) => l.includes("HWL_ASSESSMENT_URL")),
    "the existing safe rejection warning must still fire for a bad override",
  );
});

// 4. Exact-origin matching means a www. host is a different origin. There is no
// allowlist that admits it, and this test pins that until one is added.
test("www.hairwellnessslab.com is rejected and never becomes an effective URL", async () => {
  const s = (await load({
    HWL_API_BASE_URL: HWL,
    HWL_ASSESSMENT_URL: "https://www.hairwellnessslab.com/crownprint",
    HWL_PRODUCT_HUB_URL: "https://www.hairwellnessslab.com/product-hub",
  })).crownprintConfigSummary();

  assert.equal(s.urls.create, `${HWL}/crownprint`, "www override rejected, contract path used");
  assert.equal(s.urls.productHub, null, "www Product Hub rejected outright");
  assert.ok(!JSON.stringify(s).includes("www."), "no www host in the report");
});

// 5 + 6. Readiness is accurate, and an unset NON-SECRET variable is named so the
// misconfiguration is actionable.
test("readiness is reported accurately and missing variable names are shown", async () => {
  const ready = await load({ HWL_API_BASE_URL: HWL });
  assert.equal(ready.crownprintConfigSummary().configured, true);
  assert.deepEqual(ready.crownprintConfigSummary().missing, []);

  const bare = await load({}, { secrets: false });
  const s = bare.crownprintConfigSummary();
  assert.equal(s.configured, false);
  assert.deepEqual(s.missing, ["HWL_API_BASE_URL", "WYNN_INTEGRATION_HMAC_SECRET", "WYNN_SESSION_SECRET"]);
  assert.deepEqual(Object.values(s.urls), [null, null, null, null, null, null]);

  const lines = capture(() => bare.logCrownprintConfigOnce());
  assert.ok(lines.includes("[crownprint] integration configured: false"));
  assert.ok(lines.some((l) => l.startsWith("[crownprint] missing config: ")));

  // Only a base that IS set but points elsewhere is an origin mismatch; an unset
  // base is already reported as missing config.
  assert.ok(!lines.some((l) => l.includes("does not match canonical")), "no redundant origin warning when nothing is configured");
});

// The production-origin warning still fires when a prod deployment is pointed
// away from the canonical origin.
test("a production deployment off the canonical origin emits the warning", async () => {
  const prior = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const m = await load({ HWL_API_BASE_URL: `https://${WRONG_HOST}` });
    assert.equal(m.crownprintConfigSummary().productionOriginOk, false);
    const lines = capture(() => m.logCrownprintConfigOnce());
    assert.ok(
      lines.some((l) => l.includes("WARNING: HWL production origin does not match canonical Hair Wellness Lab origin")),
      "expected the canonical-origin warning",
    );
  } finally {
    process.env.NODE_ENV = prior;
  }
});

// 7 + 8. No secret VALUE can appear, and no secret-named key is serialized
// alongside a value. Secret names may appear only as bare strings in `missing`.
test("no secret values appear in the diagnostic, and no secret key carries a value", async () => {
  for (const env of [
    { HWL_API_BASE_URL: HWL, HWL_PRODUCT_HUB_URL: `${HWL}/product-hub` },
    { HWL_API_BASE_URL: `https://${WRONG_HOST}` },
    {},
  ]) {
    const m = await load(env);
    process.env.STRIPE_SECRET_KEY = "sk_live_SENTINEL_stripe";
    process.env.ORDERS_DATABASE_POSTGRES_URL = "postgres://user:SENTINEL_pw@host/db";
    const s = m.crownprintConfigSummary();
    const blob = `${JSON.stringify(s)}\n${capture(() => m.logCrownprintConfigOnce()).join("\n")}`;

    for (const secret of [HMAC_SENTINEL, SESSION_SENTINEL, "sk_live_SENTINEL_stripe", "SENTINEL_pw", "postgres://"]) {
      assert.ok(!blob.includes(secret), `secret value leaked into the diagnostic: ${secret}`);
    }
    // A secret name may be reported as missing, but never as "name": "value".
    for (const name of ["WYNN_INTEGRATION_HMAC_SECRET", "WYNN_SESSION_SECRET"]) {
      assert.ok(!new RegExp(`"${name}"\\s*:`).test(blob), `${name} must never be serialized as a key with a value`);
      if (blob.includes(name)) {
        assert.ok(s.missing.includes(name), `${name} may appear only as a missing-config name`);
      }
    }
    // The raw secret fields on the config object are never copied in.
    for (const key of ["hmacSecret", "sessionSecret"]) {
      assert.ok(!JSON.stringify(s).includes(key), `${key} must not be part of the summary`);
    }
  }
});

// 9. No user or CrownPrint data can enter the diagnostic: it takes no request,
// session or context argument, and its shape is a closed whitelist.
test("no user, session or CrownPrint data can enter the diagnostic", async () => {
  const m = await load({ HWL_API_BASE_URL: HWL, HWL_PRODUCT_HUB_URL: `${HWL}/product-hub` });

  assert.equal(m.crownprintConfigSummary.length, 0, "the summary accepts no arguments, so no request data can be passed in");

  const s = m.crownprintConfigSummary();
  assert.deepEqual(Object.keys(s).sort(), ["canonicalOrigin", "configured", "missing", "productionOriginOk", "urls"]);
  assert.deepEqual(Object.keys(s.urls).sort(), ["base", "connect", "create", "crownstate", "exchange", "productHub"]);

  // Every reported URL is a plain destination on the configured HWL origin —
  // no data is smuggled into a path or query string.
  for (const u of Object.values(s.urls)) {
    if (u === null) continue;
    assert.ok(u.startsWith(`${HWL}/`) || u === HWL, `unexpected reported URL: ${u}`);
    assert.equal(new URL(u).search, "", "reported URLs carry no query string");
  }

  // Nothing shaped like CrownPrint/CrownState/match/session material is present.
  // The `urls` block is excluded because "/crownstate" is a destination we WANT
  // reported; it is validated above instead.
  const rest = { ...s };
  delete rest.urls;
  const nonUrlReport = capture(() => m.logCrownprintConfigOnce())
    .filter((l) => REPORT_LINE.test(l))
    .filter((l) => !/^\[crownprint\] (HWL base|create|connect|crownstate|product hub):/.test(l));
  const blob = `${JSON.stringify(rest)}\n${nonUrlReport.join("\n")}`;
  for (const field of ["code", "matches", "matchClass", "crownState", "crownHistory", "userUuid", "cookie", "signature", "ruleVersion", "currentPriorityLabel", "whatToLookFor", "productKey", "sessionId"]) {
    assert.ok(!new RegExp(`\\b${field}\\b`, "i").test(blob), `diagnostic must not carry ${field}`);
  }

  // The diagnostic never reads the per-request safeLinks from an HWL response.
  const lib = await readFile(new URL("../lib/crownprint.ts", import.meta.url), "utf8");
  const fn = lib.slice(lib.indexOf("export function crownprintConfigSummary"));
  // Strip comments: the body documents WHY safeLinks is excluded, and this
  // assertion is about the code, not the prose.
  const code = fn
    .slice(0, fn.indexOf("\n}"))
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  assert.doesNotMatch(code, /safeLinks|readMatchSession|cookies\(|headers\(/);
});

// 10. Diagnostics observe; they must not change what the integration does.
test("running diagnostics does not alter integration behavior", async () => {
  const env = { HWL_API_BASE_URL: HWL, HWL_ASSESSMENT_URL: `https://${WRONG_HOST}/crownprint`, HWL_PRODUCT_HUB_URL: `${HWL}/product-hub` };
  process.env.WYNN_SESSION_SECRET ||= SESSION_SENTINEL;

  const dest = async (m, flow) => {
    const u = await m.buildOutboundRedirect(flow);
    if (!u) return null;
    const p = new URL(u);
    p.search = "";
    return p.toString();
  };

  const before = await load(env);
  const baseline = {
    create: await dest(before, "create"),
    connect: await dest(before, "connect"),
    refresh: await dest(before, "refresh"),
    ready: before.crownprintIntegrationReady(),
    productHub: before.hwlUrl(before.crownprintConfig.productHubUrl),
  };

  const after = await load(env);
  capture(() => after.logCrownprintConfigOnce());
  after.crownprintConfigSummary();
  capture(() => after.logCrownprintConfigOnce());

  assert.deepEqual(
    {
      create: await dest(after, "create"),
      connect: await dest(after, "connect"),
      refresh: await dest(after, "refresh"),
      ready: after.crownprintIntegrationReady(),
      productHub: after.hwlUrl(after.crownprintConfig.productHubUrl),
    },
    baseline,
    "flow URLs and readiness are identical with diagnostics run",
  );

  // Still the trusted fallback, not the rejected override.
  assert.equal(baseline.create, `${HWL}/crownprint`);
});

// No public debug endpoint: the diagnostic is a server-side log, and the only
// callers are server entry points that already existed.
test("the diagnostic is not exposed through any HTTP route", async () => {
  const lib = await readFile(new URL("../lib/crownprint.ts", import.meta.url), "utf8");
  // It returns data / logs; it never builds a Response.
  const fn = lib.slice(lib.indexOf("export function crownprintConfigSummary"));
  assert.doesNotMatch(fn, /NextResponse|new Response\(/);

  const route = await readFile(new URL("../app/shop-by-crownprint/connect/route.ts", import.meta.url), "utf8");
  // The connect route triggers the cold-start log but never returns the summary.
  assert.match(route, /logCrownprintConfigOnce\(\);/);
  assert.doesNotMatch(route, /crownprintConfigSummary/, "the summary must never be serialized into a response");
});
