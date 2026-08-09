// The integration health route.
//
// It exists to answer "do the two sites hold the same secret?" without a live
// connect attempt. That makes it a fingerprint oracle, so what it refuses to do
// matters as much as what it returns.
const ADMIN_TOKEN = "test-admin-token-at-least-16-chars";
const HMAC_SECRET = "test-only-shared-secret-not-a-real-one";
process.env.ADMIN_ORDERS_TOKEN = ADMIN_TOKEN;
process.env.HWL_API_BASE_URL ||= "https://hairwellnessslab.com";
process.env.WYNN_INTEGRATION_HMAC_SECRET = HMAC_SECRET;
process.env.WYNN_SESSION_SECRET ||= "test-only-session-secret";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

// Dynamic: `import` declarations hoist above the assignments above, and the
// route reads its configuration at module scope.
const { GET } = await import("../app/api/internal/crownprint-integration-health/route.ts");

const call = (init) => GET(new Request("https://wynnessentialsllc.us/api/internal/crownprint-integration-health", init));
const withToken = (token) => call({ headers: { authorization: `Bearer ${token}` } });

test("1. an unauthenticated caller gets a 404, not a 401", async () => {
  const res = await call({});
  assert.equal(res.status, 404, "an unauthorized caller must not learn the route exists");
  const body = await res.text();
  assert.ok(!body.includes(HMAC_SECRET));
  assert.ok(!body.includes("fingerprint"));
});

test("2. a wrong token gets the same 404", async () => {
  for (const bad of ["", "wrong", `${ADMIN_TOKEN}x`, ADMIN_TOKEN.slice(0, -1)]) {
    assert.equal((await withToken(bad)).status, 404, `"${bad}" must not authorize`);
  }
  assert.equal((await call({})).status, 404);
});

test("3. the admin token returns exactly the five approved fields", async () => {
  const res = await withToken(ADMIN_TOKEN);
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.deepEqual(
    Object.keys(body).sort(),
    ["allowedOriginConfigured", "app", "audience", "environment", "integrationConfigured", "secretFingerprint"],
    "the payload is a fixed allowlist — nothing else may be added by accident",
  );
  assert.equal(body.app, "wynn-essentials");
  assert.equal(body.integrationConfigured, true);
  assert.equal(body.allowedOriginConfigured, true);
  assert.equal(body.audience, "wynn-essentials");
});

test("4. the fingerprint is the same value both sites log, and nothing more", async () => {
  const body = await (await withToken(ADMIN_TOKEN)).json();
  assert.equal(body.secretFingerprint, createHash("sha256").update(HMAC_SECRET).digest("hex").slice(0, 12));
  assert.match(body.secretFingerprint, /^[0-9a-f]{12}$/);
});

test("5. no secret, key, signature, or token is ever in the response", async () => {
  const res = await withToken(ADMIN_TOKEN);
  const raw = await res.text();
  assert.ok(!raw.includes(HMAC_SECRET), "the HMAC secret must never be returned");
  assert.ok(!raw.includes(ADMIN_TOKEN), "the admin token must never be echoed back");
  assert.ok(!raw.includes(process.env.WYNN_SESSION_SECRET), "no other secret may leak either");
  assert.doesNotMatch(raw, /signature|connectCode|code"/i);
  // And it must not be cached or indexed anywhere.
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-robots-tag"), "noindex");
});

test("6. a query-string token works too, for a quick curl", async () => {
  const res = await GET(
    new Request(`https://wynnessentialsllc.us/api/internal/crownprint-integration-health?token=${ADMIN_TOKEN}`),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).app, "wynn-essentials");
});
