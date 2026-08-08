// Rendered-HTML checks for the Shop by CrownPrint™ failure screens.
//
// The CrownPrint env is set BEFORE the worker is imported: lib/crownprint.ts
// reads its configuration at module scope, and without it every state collapses
// to INTEGRATION_UNAVAILABLE, which would render none of the panels under test.
// These are throwaway local values — no real secret is involved, and nothing
// here contacts Hair Wellness Lab.
process.env.HWL_API_BASE_URL ||= "https://hairwellnessslab.com";
process.env.WYNN_INTEGRATION_HMAC_SECRET ||= "test-only-not-a-real-secret";
process.env.WYNN_SESSION_SECRET ||= "test-only-not-a-real-session-secret";

import assert from "node:assert/strict";
import test from "node:test";

async function render(path) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const res = await worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  return res.text();
}

const occurrences = (haystack, needle) => haystack.split(needle).length - 1;

// The recovery copy, verbatim from lib/crownprint-state.mjs. If that text is
// reworded, this test should be updated with it — it is the string a shopper
// actually reads on the failure screen.
const HANDSHAKE_NOTE = "We couldn&#x27;t complete the secure handshake with the Hair Wellness Lab";

// ---------------------------------------------------------------------------
// Reported from production: on the failed-handshake screen the black toast sat
// directly on top of the reconnect panel, printing the same sentence twice —
// once in the panel, once floating over it. The explanation belongs in the
// panel. The toast is for transient feedback, and must not duplicate it.
// ---------------------------------------------------------------------------
test("the handshake failure is explained once, in the panel — never also as a toast", async () => {
  const html = await render("/shop-by-crownprint?state=ERROR");

  assert.equal(
    occurrences(html, HANDSHAKE_NOTE),
    1,
    "the recovery note must appear exactly once — a second copy is the toast overlapping the panel",
  );
  // It is the panel's note, not the toast, that carries it.
  const noteAt = html.indexOf(HANDSHAKE_NOTE);
  const panelAt = html.indexOf("cp-reconnect");
  assert.ok(panelAt > -1 && noteAt > panelAt, "the note must render inside the reconnect panel");
  // The toast element still exists (add-to-cart uses it) but opens empty.
  assert.match(html, /class="cp-toast"/, "the toast must not start in its shown state");
  assert.doesNotMatch(html, /class="cp-toast show"/);
});

test("every recovery state explains itself once, and never asks for payment again", async () => {
  for (const state of ["ERROR", "SESSION_LOST", "EXPIRED"]) {
    const html = await render(`/shop-by-crownprint?state=${state}`);
    assert.match(html, /finish connecting your CrownPrint/, `${state} must render the reconnect panel`);
    assert.doesNotMatch(html, /\$9\.99/, `${state} must never show a price — they already own a CrownPrint`);
    assert.doesNotMatch(html, /class="cp-toast show"/, `${state} must not float its explanation over the panel`);
  }
});

test("a shopper with no CrownPrint still sees the price, and no stray toast", async () => {
  const html = await render("/shop-by-crownprint?state=NO_CROWNPRINT");
  assert.match(html, /\$9\.99/, "NO_CROWNPRINT is a verdict, and is priced honestly");
  assert.doesNotMatch(html, /finish connecting your CrownPrint/, "a verdict is not a broken handshake");
  assert.doesNotMatch(html, /class="cp-toast show"/);
});
