// The customer-facing brand name is "Wynn Essentials". A customer must never see
// the company called just "Wynn".
//
// This scans what a customer actually receives — the rendered HTML of every
// significant page — rather than the source, so it catches copy wherever it is
// assembled: JSX, server-composed strings, metadata, alt text, aria-labels, and
// JSON-LD alike. Internal identifiers never reach the page, so they need no
// exemption here and the test cannot be fooled by one.
process.env.HWL_API_BASE_URL ||= "https://hairwellnessslab.com";
process.env.WYNN_INTEGRATION_HMAC_SECRET ||= "test-only-not-a-real-secret";
process.env.WYNN_SESSION_SECRET ||= "test-only-not-a-real-session-secret";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

/**
 * Uses of "Wynn" that are NOT the company being under-named. Each is a proper
 * noun in its own right, so each is removed before the check rather than
 * excused afterwards.
 */
const LEGITIMATE = [
  /Wynn\s+Essentials/gi,        // the brand, correctly written
  /(The\s+)?Wynn\s+Method/gi,   // the named routine framework
  /(The\s+)?Wynn\s+Edit/gi,     // the newsletter
  /(The\s+)?Wynn\s+Sisters/gi,  // the founders, collectively
  /\b(Patricia|Karina|Sheree)\s+Wynn\b/gi, // the founders, individually — a surname
  /WYNN\s*<[^>]*>\s*ESSENTIALS/gi,        // the wordmark, split across elements
  /wynnessentials[a-z]*/gi,     // domains, handles, storage keys
  /wynn-essentials/gi,          // slugs and integration identifiers
  /X-Wynn-[A-Za-z]+/gi,         // HTTP header names in the integration contract
  // Attributes that carry identifiers rather than language: element ids, class
  // names, link targets, asset paths. A customer reads the link text, never the
  // href — renaming these would change behavior without changing a word anyone
  // reads. Deliberately NOT stripped: alt, aria-label, title, placeholder and
  // meta content, which a customer (or a screen reader) does read.
  /\s(?:id|class|className|href|src|srcSet|srcset|for|name|key|data-[\w-]+|aria-(?:controls|labelledby|describedby))="[^"]*"/gi,
  // The same paths again where they appear as bare strings — JSON-LD image
  // arrays and the serialized RSC payload, which are not attributes.
  /[/#][A-Za-z0-9._~/-]*wynn[A-Za-z0-9._~/-]*/gi,
];

const strip = (html) => LEGITIMATE.reduce((acc, pattern) => acc.replace(pattern, " "), html);

/** Report offenders with enough context to find them in the source. */
function offenders(html) {
  const cleaned = strip(html);
  const found = [];
  for (const match of cleaned.matchAll(/\bWynn\b/gi)) {
    found.push(cleaned.slice(Math.max(0, match.index - 70), match.index + 70).replace(/\s+/g, " ").trim());
  }
  return found;
}

// Every page a customer can land on, including the CrownPrint surfaces where
// this copy lives and the failure states, which are easy to forget.
const PAGES = [
  "/",
  "/about",
  "/crownprint",
  "/crownprint?cp=P2-D3-T3-S2-E2&style=braids&scalp=tender&concern=dryness",
  "/crownprint?cp=S2",
  "/shop-by-crownprint",
  "/shop-by-crownprint?state=ERROR",
  "/shop-by-crownprint?state=NO_CROWNPRINT",
  "/products/hydrate-herbal-hair-mist",
  "/braiding-hair",
  "/blog",
];

for (const path of PAGES) {
  test(`the brand is never shortened to "Wynn" on ${path}`, async () => {
    const html = await render(path);
    const found = offenders(html);
    assert.deepEqual(found, [], `standalone "Wynn" in customer-facing copy on ${path}:\n  - ${found.join("\n  - ")}`);
  });
}

// The transactional emails are customer-facing too, and never render through a
// page, so they are checked at the source.
test("the brand is never shortened to \"Wynn\" in customer emails", async () => {
  const notify = await readFile(new URL("../lib/notify.ts", import.meta.url), "utf8");
  // Strings only: comments and identifiers in this file are not customer copy.
  const strings = [...notify.matchAll(/"([^"\\]|\\.)*"|`([^`\\]|\\.)*`/g)].map((m) => m[0]).join("\n");
  assert.deepEqual(offenders(strings), []);
});

// A guard on the guard: if the allowlist ever grew loose enough to permit the
// real thing, these two must still fail.
test("the check itself still catches a bare brand reference", () => {
  assert.notDeepEqual(offenders("<p>Best Wynn matches</p>"), []);
  assert.notDeepEqual(offenders("<p>WHAT WYNN DOES NOT CURRENTLY CARRY</p>"), []);
  assert.notDeepEqual(offenders("<p>Wynn matched its catalog to these.</p>"), []);
  assert.notDeepEqual(offenders("<p>Wynn never promotes a product.</p>"), []);
  // …while still permitting every legitimate use.
  assert.deepEqual(offenders("<p>Best Wynn Essentials matches, from The Wynn Method, by Patricia Wynn.</p>"), []);
});
