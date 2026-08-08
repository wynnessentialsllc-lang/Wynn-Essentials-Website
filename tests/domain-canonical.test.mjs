import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const url = (p) => new URL(p, import.meta.url);
const read = (p) => readFile(url(p), "utf8");
const repo = new URL("../", import.meta.url).pathname;

// The canonical Hair Wellness Lab production origin: hair + wellness + s + lab.
const HWL = "https://hairwellnessslab.com";
// The near-miss host (one fewer "s"). Built by concatenation so this guard file
// never itself contains the literal it is scanning the tree for. Note that the
// wrong spelling is NOT a substring of the right one ("nesslab" vs "nessslab"),
// so a plain substring scan cannot false-positive on the canonical host.
const WRONG_HOST = "hairwellness" + "lab.com";

// Wynn's own canonical origin, which is a DIFFERENT site from HWL and must never
// be confused with it.
const WYNN = "https://wynnessentialsllc.us";

const TEXT_EXT = /\.(ts|tsx|mjs|js|jsx|json|md|sql|css|yml|yaml|txt|example)$/;

// Every tracked text file, minus lockfiles (huge, machine-generated, and no
// domain of ours is expressed there).
const trackedTextFiles = () =>
  execFileSync("git", ["ls-files", "-z"], { cwd: repo, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((f) => TEXT_EXT.test(f) || f === ".env.example")
    .filter((f) => !f.endsWith("package-lock.json"));

async function scan(predicate) {
  const hits = [];
  for (const file of trackedTextFiles()) {
    let body;
    try {
      body = await readFile(new URL(file, url("../")), "utf8");
    } catch {
      continue;
    }
    for (const [i, line] of body.split("\n").entries()) {
      if (predicate(line, file)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
    }
  }
  return hits;
}

// 1 + 2. The misspelled host must not exist anywhere in the tree — not in code,
// config, docs, tests, fixtures or examples.
test("the misspelled Hair Wellness Lab host appears nowhere in the repository", async () => {
  const hits = await scan((line) => line.includes(WRONG_HOST));
  assert.deepEqual(hits, [], `misspelled HWL host (…${WRONG_HOST}) found:\n${hits.join("\n")}`);
});

// 2. Exactly ONE HWL host literal exists in application code: the canonical
// origin constant that hwlUrl() validates against. Every other reference must
// come from configuration, so a routing change stays an env change.
test("the only HWL host literal in application code is the canonical origin constant", async () => {
  const hits = await scan(
    (line, file) => /^(app|lib|scripts|worker)\//.test(file) && /hairwellness/i.test(line),
  );
  // Strip the "file:line:" prefix so the comparison is about WHICH literals
  // exist, not which line they happen to sit on.
  assert.deepEqual(
    hits.map((h) => h.replace(/^\S+?:\d+:\s*/, "")),
    [`export const HWL_CANONICAL_ORIGIN = "${HWL}";`],
    `unexpected HWL host literal in application code:\n${hits.join("\n")}`,
  );
  assert.ok(hits[0].startsWith("lib/crownprint.ts:"), "the canonical constant belongs in lib/crownprint.ts");

  // The four HWL_* vars are the only inbound path for that host.
  const lib = await read("../lib/crownprint.ts");
  assert.match(lib, /apiBaseUrl:\s*process\.env\.HWL_API_BASE_URL/);
  assert.match(lib, /assessmentUrl:\s*process\.env\.HWL_ASSESSMENT_URL/);
  assert.match(lib, /crownstateUpdateUrl:\s*process\.env\.HWL_CROWNSTATE_UPDATE_URL/);
  assert.match(lib, /productHubUrl:\s*process\.env\.HWL_PRODUCT_HUB_URL/);
});

// 1 + 3 + 4. The canonical origin is documented with the correct spelling, with
// no trailing slash, and the CrownPrint contract paths hang off it.
test("the documented canonical HWL origin is correct and stored without a trailing slash", async () => {
  const env = await read("../.env.example");
  const doc = await read("../docs/wynn-essentials-integration.md");

  assert.match(env, /^HWL_API_BASE_URL=https:\/\/hairwellnessslab\.com$/m, "base URL must be the canonical origin, no trailing slash");
  assert.ok(doc.includes(HWL), "the integration doc must state the canonical origin");

  // Contract paths that compose onto the base, confirmed against lib/crownprint.ts
  // rather than invented here.
  const lib = await read("../lib/crownprint.ts");
  assert.match(lib, /const CONNECT_PATH = "\/crownprint\/connect"/);
  assert.match(lib, /const CREATE_PATH = "\/crownprint"/);
  assert.match(lib, /const CROWNSTATE_PATH = "\/crownstate"/);
  for (const path of ["/crownprint/connect", "/crownprint", "/crownstate", "/product-hub"]) {
    assert.ok(doc.includes(`${HWL}${path}`), `doc must resolve ${path} against the canonical origin`);
  }

  // Any HWL_* value that IS set must carry the canonical host and no trailing slash.
  for (const [, name, value] of env.matchAll(/^(HWL_\w*URL)=(\S+)$/gm)) {
    assert.equal(new URL(value).origin, HWL, `${name} must point at the canonical HWL origin`);
    assert.doesNotMatch(value, /\/$/, `${name} must not end in a trailing slash`);
  }
});

// 5. Wynn's own SEO surface is a separate domain and stays that way: the sitemap,
// robots and canonical metadata emit wynnessentialsllc.us, never an HWL host.
test("Wynn canonical/sitemap/robots metadata uses the Wynn domain, never an HWL host", async () => {
  const seo = await read("../app/seo.ts");
  const robots = await read("../app/robots.ts");
  const sitemap = await read("../app/sitemap.ts");
  const crownprintPage = await read("../app/shop-by-crownprint/page.tsx");

  assert.match(seo, new RegExp(`export const SITE_URL = "${WYNN}"`));
  assert.ok(robots.includes(`sitemap: "${WYNN}/sitemap.xml"`), "robots must advertise the Wynn sitemap");
  assert.notEqual(WYNN, HWL, "Wynn and HWL are distinct production origins");

  // The sitemap and the Shop by CrownPrint canonical build off SITE_URL, so no
  // second production spelling can ever be emitted for the same page.
  assert.match(sitemap, /url: `\$\{SITE_URL\}\/shop-by-crownprint`/);
  assert.match(crownprintPage, /alternates: \{ canonical: CANONICAL \}/);
  assert.match(crownprintPage, /url: `\$\{SITE_URL\}\$\{CANONICAL\}`/);

  for (const [name, body] of Object.entries({ seo, robots, sitemap, crownprintPage })) {
    assert.doesNotMatch(body, /hairwellness/i, `${name} must not reference an HWL host`);
  }
});

// 6. Stripe redirect URLs and outbound email links resolve from Wynn's own
// configured site URL — they are Wynn destinations, never HWL ones.
test("Stripe success/cancel URLs and email links use the configured Wynn site URL", async () => {
  const checkout = await read("../app/api/stripe/create-checkout-session/route.ts");
  const reviewEmails = await read("../app/api/cron/review-requests/route.ts");

  assert.match(checkout, /success_url: `\$\{commerceConfig\.siteUrl\}\/order\/success/);
  assert.match(checkout, /cancel_url: `\$\{commerceConfig\.siteUrl\}\/order\/cancelled`/);
  assert.match(reviewEmails, /url: `\$\{commerceConfig\.siteUrl\}\//);

  for (const [name, body] of Object.entries({ checkout, reviewEmails })) {
    assert.doesNotMatch(body, /hairwellness/i, `${name} must not link to an HWL host`);
  }
});

// Every HWL URL sink is audited against the canonical origin AT RUNTIME, not
// just in source text. lib/crownprint.ts is loaded with real env values through
// a stub for next/headers, so these exercise the shipped hwlUrl() logic.
async function loadCrownprint(env) {
  for (const k of ["HWL_API_BASE_URL", "HWL_ASSESSMENT_URL", "HWL_CROWNSTATE_UPDATE_URL", "HWL_PRODUCT_HUB_URL"]) delete process.env[k];
  Object.assign(process.env, env);
  // buildOutboundRedirect() refuses to build a URL without these, and it is the
  // HWL destination — not the session plumbing — that is under test here.
  process.env.WYNN_SESSION_SECRET ||= "test-session-secret-not-a-real-credential";
  process.env.WYNN_INTEGRATION_HMAC_SECRET ||= "test-hmac-secret-not-a-real-credential";
  return import(`../lib/crownprint.ts?canonical=${encodeURIComponent(JSON.stringify(env))}`);
}

// Node can only import the .ts source directly under --experimental-strip-types,
// and only with next/headers stubbed. Skip cleanly elsewhere rather than fail.
const canLoadSource = await loadCrownprint({ HWL_API_BASE_URL: HWL }).then(() => true, () => false);

test("every HWL URL sink resolves to the canonical origin at runtime", { skip: !canLoadSource }, async () => {
  const m = await loadCrownprint({ HWL_API_BASE_URL: HWL, HWL_PRODUCT_HUB_URL: `${HWL}/product-hub` });
  const dest = async (flow) => {
    const u = await m.buildOutboundRedirect(flow);
    const parsed = new URL(u);
    parsed.search = "";
    return parsed.toString();
  };
  assert.equal(await dest("connect"), `${HWL}/crownprint/connect`);
  assert.equal(await dest("create"), `${HWL}/crownprint`);
  assert.equal(await dest("refresh"), `${HWL}/crownstate`);
  assert.equal(m.hwlUrl(m.crownprintConfig.productHubUrl), `${HWL}/product-hub`);
  assert.equal(`${m.crownprintConfig.apiBaseUrl}/api/integrations/wynn-essentials/match`, `${HWL}/api/integrations/wynn-essentials/match`);
  assert.equal(m.productionOriginOk(), true);
});

test("a trailing slash on the base never composes into a double-slashed HWL URL", { skip: !canLoadSource }, async () => {
  const m = await loadCrownprint({ HWL_API_BASE_URL: `${HWL}/` });
  assert.equal(m.crownprintConfig.apiBaseUrl, HWL, "the stored origin is slash-trimmed");
  const u = new URL(await m.buildOutboundRedirect("connect"));
  u.search = "";
  assert.equal(u.toString(), `${HWL}/crownprint/connect`);
});

test("an HWL_* override off the canonical origin is rejected and falls back to the contract path", { skip: !canLoadSource }, async () => {
  const m = await loadCrownprint({
    HWL_API_BASE_URL: HWL,
    // The two-s near-miss host and an unrelated host must BOTH be refused.
    HWL_ASSESSMENT_URL: `https://${WRONG_HOST}/crownprint`,
    HWL_CROWNSTATE_UPDATE_URL: "https://evil.example/crownstate",
    HWL_PRODUCT_HUB_URL: `https://${WRONG_HOST}/product-hub`,
  });
  const dest = async (flow) => {
    const u = new URL(await m.buildOutboundRedirect(flow));
    u.search = "";
    return u.toString();
  };
  // Degrades to the correct URL rather than redirecting shoppers off-origin.
  assert.equal(await dest("create"), `${HWL}/crownprint`);
  assert.equal(await dest("refresh"), `${HWL}/crownstate`);
  // The Product Hub CTA is omitted rather than pointed at the wrong host.
  assert.equal(m.hwlUrl(m.crownprintConfig.productHubUrl), null);
});

test("safeLinks from the HWL response are origin-checked before becoming hrefs", { skip: !canLoadSource }, async () => {
  const m = await loadCrownprint({ HWL_API_BASE_URL: HWL });
  const links = (v) => m.normalizeMatchContext({ safeLinks: { productHub: v, assessment: v, crownstateUpdate: v } }).safeLinks;

  assert.deepEqual(links(`${HWL}/product-hub`), {
    productHub: `${HWL}/product-hub`,
    assessment: `${HWL}/product-hub`,
    crownstateUpdate: `${HWL}/product-hub`,
  });

  // A near-miss host, a foreign host, and a script URL are all dropped. The
  // last matters most: this value is rendered directly into an href.
  for (const bad of [`https://${WRONG_HOST}/product-hub`, "https://evil.example/phish", "javascript:alert(1)", "data:text/html,<script>", "not a url"]) {
    assert.equal(links(bad), undefined, `safeLinks must reject ${bad}`);
  }
});

test("a production deployment pointed off the canonical origin is reported as misconfigured", { skip: !canLoadSource }, async () => {
  const prior = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.equal((await loadCrownprint({ HWL_API_BASE_URL: HWL })).productionOriginOk(), true);
    assert.equal((await loadCrownprint({ HWL_API_BASE_URL: `https://${WRONG_HOST}` })).productionOriginOk(), false);
    assert.equal((await loadCrownprint({})).productionOriginOk(), false);
  } finally {
    process.env.NODE_ENV = prior;
  }
});

// 7. Normalization must not have loosened the security boundary: the return URL
// is still same-origin-derived, the outbound hop still leaks nothing but
// `return`/`source`, and the HMAC contract is untouched.
test("domain normalization did not weaken the CrownPrint security architecture", async () => {
  const lib = await read("../lib/crownprint.ts");

  // The return URL is built from Wynn's OWN origin — never from an HWL-supplied
  // or otherwise attacker-controlled value.
  assert.match(lib, /export function returnUrl\(origin: string\) \{\s*return `\$\{origin\}\$\{RETURN_PATH\}`;/);
  assert.match(lib, /const RETURN_PATH = "\/shop-by-crownprint\/connect"/);
  assert.match(lib, /return new URL\(commerceConfig\.siteUrl\)\.origin/);

  // Still exactly two query params crossing to HWL.
  const fn = lib.slice(lib.indexOf("export async function buildOutboundRedirect"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  const params = (body.match(/searchParams\.set\("([^"]+)"/g) || []).map((p) => p.match(/"([^"]+)"/)[1]).sort();
  assert.deepEqual(params, ["return", "source"], "only `return` and `source` may cross to HWL");

  // HMAC contract intact: one signed request, no Bearer token, secret unchanged.
  assert.match(lib, /`\$\{timestamp\}\.\$\{rawBody\}`/);
  assert.match(lib, /"X-Wynn-Timestamp":/);
  assert.match(lib, /"X-Wynn-Signature":/);
  assert.equal((lib.match(/await fetch\(/g) || []).length, 1);
  assert.doesNotMatch(lib, /Authorization["'`]?\s*:/);
  assert.doesNotMatch(lib, /process\.env\.WYNN_CONNECT_TOKEN_SECRET/);

  // Wynn's own API routes still pin their origin check to the Wynn site URL — an
  // HWL host must never be added to an origin allowlist.
  for (const route of ["subscribe", "reviews", "support", "abandoned"]) {
    const src = await read(`../app/api/${route}/route.ts`);
    assert.match(src, /const siteOrigin = new URL\(commerceConfig\.siteUrl\)\.origin/, `${route} must pin its origin check`);
    assert.doesNotMatch(src, /hairwellness/i, `${route} must not allowlist an HWL origin`);
  }
});
