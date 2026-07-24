import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the complete Wynn Essentials storefront", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Wynn Essentials \| Healthy Hair Is a Practice<\/title>/i);
  assert.match(html, /Healthy Hair/);
  assert.match(html, /Shop the Essentials/);
  assert.match(html, /The Wynn Method/);
  assert.match(html, /Your Hair Does Not Need Guesswork/);
  assert.match(html, /Good Hair Information/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|lorem ipsum/i);
});

test("keeps trusted Stripe configuration server-side", async () => {
  const [catalog, checkout, webhook] = await Promise.all([
    readFile(new URL("../app/data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stripe/create-checkout-session/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stripe/webhook/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(catalog, /stripePriceId/);
  assert.match(checkout, /line_items:\s*resolved/);
  // Non-option items charge via the stored Stripe price ID.
  assert.match(checkout, /price: product\.stripePriceId/);
  // price_data is used only to carry a chosen option (e.g. bonnet color) at the
  // same price. Every unit_amount must derive from the server catalog
  // (product.price), never from the client request body.
  for (const [, expr] of checkout.matchAll(/unit_amount:\s*([^,}]+)/g)) {
    assert.match(expr, /product\.price/, "unit_amount must come from the server catalog, not the client");
  }
  assert.match(webhook, /constructEvent\(await request\.text\(\)/);
  assert.match(webhook, /checkout\.session\.async_payment_succeeded/);
});

test("renders checkout cancellation without clearing the cart", async () => {
  const response = await render("/order/cancelled");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Your checkout was not completed/);
  assert.match(html, /Your cart is still here/);
  assert.doesNotMatch(html, /removeItem\(&quot;wynnCart&quot;\)/);
});
