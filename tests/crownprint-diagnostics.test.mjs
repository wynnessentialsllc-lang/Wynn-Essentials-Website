// The non-secret HMAC diagnostics, and the signing contract they exist to prove.
//
// Env is set BEFORE the adapter is imported: lib/crownprint.ts reads its
// configuration at module scope. These are throwaway local values and nothing
// here contacts Hair Wellness Lab — `fetch` is stubbed.
const TEST_SECRET = "test-only-shared-secret-not-a-real-one";
process.env.HWL_API_BASE_URL ||= "https://hairwellnessslab.com";
process.env.WYNN_INTEGRATION_HMAC_SECRET = TEST_SECRET;
process.env.WYNN_SESSION_SECRET ||= "test-only-session-secret";

import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

// Dynamic, deliberately: `import` declarations are hoisted above the assignments
// above, and lib/crownprint.ts reads its configuration at module scope — a
// static import here would load the adapter with no secret configured.
const {
  EXCHANGE_TIMESTAMP_UNIT,
  bodyFingerprint,
  exchangeConnectCode,
  exchangeTimestamp,
  secretFingerprint,
  signExchange,
} = await import("../lib/crownprint.ts");

const RETURN_URL = "https://wynnessentialsllc.us/shop-by-crownprint/connect";

/** Capture everything written to the console during one call. */
async function captureLogs(run) {
  const lines = [];
  const original = { info: console.info, error: console.error, warn: console.warn, log: console.log };
  for (const level of Object.keys(original)) {
    console[level] = (...args) => lines.push(args.map(String).join(" "));
  }
  try {
    return { result: await run(), lines };
  } finally {
    Object.assign(console, original);
  }
}

/** Run one exchange against a stubbed HWL that answers with `status`. */
async function exchangeAgainst(status, capture = {}) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    capture.url = String(url);
    capture.headers = init.headers;
    capture.body = init.body;
    return new Response(status === 200 ? JSON.stringify({ crownPrintPresent: false }) : "", { status });
  };
  try {
    return await captureLogs(() => exchangeConnectCode("test-connect-code", RETURN_URL));
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ---------------------------------------------------------------------------
// The fingerprint itself.
// ---------------------------------------------------------------------------
test("1. the fingerprint is SHA-256(secret), hex, truncated to 12", async () => {
  const expected = createHash("sha256").update(TEST_SECRET).digest("hex").slice(0, 12);
  assert.equal(await secretFingerprint(TEST_SECRET), expected);
  assert.match(await secretFingerprint(TEST_SECRET), /^[0-9a-f]{12}$/);
});

test("2. it is deterministic, and different secrets fingerprint differently", async () => {
  const a = await secretFingerprint(TEST_SECRET);
  assert.equal(a, await secretFingerprint(TEST_SECRET), "the same secret must always fingerprint the same");
  assert.notEqual(a, await secretFingerprint(`${TEST_SECRET} `), "a trailing space is a different secret — that is the point");
  assert.notEqual(a, await secretFingerprint(`${TEST_SECRET}\n`), "a copy-paste newline must be visible as a mismatch");
});

test("3. the body fingerprint is SHA-256 of the exact bytes signed", async () => {
  const rawBody = JSON.stringify({ code: "abc", return: RETURN_URL });
  assert.equal(await bodyFingerprint(rawBody), createHash("sha256").update(rawBody).digest("hex"));
});

// ---------------------------------------------------------------------------
// The secret must never leak, in any form, anywhere.
// ---------------------------------------------------------------------------
test("4. no log line ever contains the secret, the key, or the signature", async () => {
  const sent = {};
  const { lines } = await exchangeAgainst(401, sent);
  assert.ok(lines.length > 0, "an exchange must log its diagnostics");

  const signature = sent.headers["X-Wynn-Signature"];
  for (const line of lines) {
    assert.ok(!line.includes(TEST_SECRET), `the raw secret leaked into a log line: ${line}`);
    assert.ok(!line.includes(signature), "the signature must not be logged");
    assert.ok(!line.includes("test-connect-code"), "the one-time connect code must not be logged");
  }
});

test("5. the fingerprint reaches the logs and nothing else — not the response, not the request", async () => {
  const sent = {};
  const { lines } = await exchangeAgainst(401, sent);
  const fingerprint = await secretFingerprint(TEST_SECRET);

  assert.ok(lines.some((l) => l.includes(fingerprint)), "the fingerprint must be logged for comparison");
  // Never on the wire: not in the URL, not in a header, not in the body.
  assert.ok(!sent.url.includes(fingerprint), "the fingerprint must never appear in the URL");
  assert.ok(!JSON.stringify(sent.headers).includes(fingerprint), "the fingerprint must never be sent as a header");
  assert.ok(!String(sent.body).includes(fingerprint), "the fingerprint must never be sent in the body");
});

// ---------------------------------------------------------------------------
// The signing contract this whole exercise was about. Hair Wellness Lab's
// verifier is the authority on these — see its integrationAuth.ts.
// ---------------------------------------------------------------------------
test("6. the timestamp is unix SECONDS, matching HWL's freshness window", async () => {
  assert.equal(EXCHANGE_TIMESTAMP_UNIT, "seconds");
  const ts = Number(exchangeTimestamp());
  const nowSeconds = Math.floor(Date.now() / 1000);
  assert.ok(Math.abs(nowSeconds - ts) <= 2, `${ts} must be unix seconds, not milliseconds`);
  // The bug this replaced: a millisecond timestamp lands ~56,000 years out and
  // HWL rejects it as stale before it ever checks the signature.
  assert.ok(Math.abs(nowSeconds - Date.now()) > 300, "sanity: milliseconds would be far outside the 300s window");
});

test("7. the signature is base64url HMAC-SHA256 over \"<timestamp>.<rawBody>\"", async () => {
  const timestamp = "1786227657";
  const rawBody = JSON.stringify({ code: "abc", return: RETURN_URL });
  // Computed independently, the way HWL computes it (node:crypto, base64url).
  const expected = createHmac("sha256", TEST_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  assert.equal(await signExchange(timestamp, rawBody), expected);
  assert.doesNotMatch(expected, /^[0-9a-f]+$/, "guard: this must not be hex — HWL compares base64url");
});

test("8. the bytes signed are the exact bytes sent", async () => {
  const sent = {};
  await exchangeAgainst(200, sent);
  const timestamp = sent.headers["X-Wynn-Timestamp"];
  const expected = createHmac("sha256", TEST_SECRET)
    .update(`${timestamp}.${sent.body}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  assert.equal(sent.headers["X-Wynn-Signature"], expected, "the signature must cover the body verbatim");
  assert.equal(sent.body, JSON.stringify({ code: "test-connect-code", return: RETURN_URL }), "key order is part of the contract");
});

test("9. a rejection logs both fingerprints so the two sides can be compared", async () => {
  const { lines } = await exchangeAgainst(401);
  const rejection = lines.find((l) => l.includes("rejected the exchange signature"));
  assert.ok(rejection, "a 401 must be logged");
  assert.match(rejection, /fingerprint [0-9a-f]{12}/);
  assert.match(rejection, /rawBody SHA-256 [0-9a-f]{64}/);
  assert.match(rejection, /unix seconds/);
});
