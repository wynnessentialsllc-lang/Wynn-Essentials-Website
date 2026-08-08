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
  // The Stripe price id and the unit price are resolved from the server catalog
  // (a chosen variant's, or the product's default) — never from the client
  // request body.
  assert.match(checkout, /const priceId = variant \? variant\.stripePriceId : product\.stripePriceId/);
  assert.match(checkout, /const unitPrice = variant \? variant\.price : \(product\.price/);
  // Non-option items charge via that server-resolved Stripe price id.
  assert.match(checkout, /price: priceId/);
  // price_data is used only to carry a chosen option (e.g. bonnet color) or a
  // variant without its own Stripe price, at the same price. Every unit_amount
  // must derive from the server-resolved unitPrice, never from the client body.
  for (const [, expr] of checkout.matchAll(/unit_amount:\s*([^,}]+)/g)) {
    assert.match(expr, /unitPrice/, "unit_amount must come from the server catalog, not the client");
  }
  assert.match(webhook, /constructEvent\(await request\.text\(\)/);
  assert.match(webhook, /checkout\.session\.async_payment_succeeded/);
});

// The standalone-page shell (.legal-page — policies, About, Shop by CrownPrint)
// has no wrapper padding of its own, so its brand bar, breadcrumb, and footer
// used to render hard against the viewport edge while the body copy sat in a
// centered column. Every page family must share one gutter token.
test("every page shell gives the header the same horizontal gutter as its content", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  // One token, defined once, responsive across mobile → tablet → desktop.
  assert.match(css, /--page-gutter:\s*clamp\(18px,4vw,48px\)/);
  // No page family hardcodes its own copy of it.
  assert.equal(
    (css.match(/padding:0 clamp\(18px,4vw,48px\)/g) || []).length,
    0,
    "page shells must use var(--page-gutter), not a repeated literal",
  );
  for (const shell of [/\.pdp\{[^}]*var\(--page-gutter\)/, /\.collection\{[^}]*var\(--page-gutter\)/]) {
    assert.match(css, shell);
  }

  // .legal-page has no wrapper padding, so its direct children carry the gutter
  // and share the page's content column (--page-max) with the main content.
  assert.match(css, /\.legal-page\{[^}]*--page-max:760px/);
  assert.match(
    css,
    /\.legal-page>\.pdp-bar,\s*\.legal-page>\.pdp-crumbs,\s*\.legal-page>\.pdp-footer\{[^}]*max-width:var\(--page-max\)[^}]*padding-inline:var\(--page-gutter\)/,
  );
  // Shop by CrownPrint widens the whole shell together, header included.
  assert.match(css, /\.cp-page\{--page-max:1120px\}/);
  assert.match(css, /\.cp-main\{max-width:var\(--page-max\)[^}]*var\(--page-gutter\)/);
});

test("renders checkout cancellation without clearing the cart", async () => {
  const response = await render("/order/cancelled");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Your checkout was not completed/);
  assert.match(html, /Your cart is still here/);
  assert.doesNotMatch(html, /removeItem\(&quot;wynnCart&quot;\)/);
});
