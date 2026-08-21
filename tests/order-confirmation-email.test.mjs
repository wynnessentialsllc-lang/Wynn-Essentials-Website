// The customer-facing order-confirmation email. These tests render the SHIPPED
// template (lib/order-confirmation-email.ts) against the sample orders in
// lib/order-confirmation-fixtures.ts, so what is asserted here is exactly what
// a customer receives — not a copy of the markup.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  renderOrderConfirmationEmail,
  orderConfirmationHtml,
  orderConfirmationText,
  orderConfirmationSubject,
  orderView,
  emailUrl,
  emailImageFor,
  catalogProductFor,
  orderStatusUrl,
  shippingLines,
} from "../lib/order-confirmation-email.ts";
import { orderEmailFixtures, fixtureByKey } from "../lib/order-confirmation-fixtures.ts";
import { products } from "../app/data.ts";

const repo = new URL("../", import.meta.url);
const read = p => readFile(new URL(p, repo), "utf8");
const publicFile = src => new URL(`public${src}`, repo).pathname;
const fixture = key => {
  const found = fixtureByKey(key);
  assert.ok(found, `missing fixture: ${key}`);
  return found;
};
const rendered = key => renderOrderConfirmationEmail(fixture(key).order);
const imgTags = html => [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const hrefs = html => [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);

// ---------------------------------------------------------------------------
// Every scenario renders
// ---------------------------------------------------------------------------

test("every sample order renders an HTML and a plain-text body without throwing", () => {
  assert.ok(orderEmailFixtures.length >= 7, "the preview must cover a range of orders");
  for (const { key, order } of orderEmailFixtures) {
    const { subject, html, text } = renderOrderConfirmationEmail(order);
    assert.match(subject, /^Your Wynn Essentials order is confirmed/, `${key}: subject`);
    assert.match(html, /^<!DOCTYPE html>/, `${key}: needs a doctype`);
    assert.equal((html.match(/<body/g) || []).length, 1, `${key}: exactly one body`);
    assert.ok(text.length > 400, `${key}: plain-text alternative is too short to be useful`);
    // A stray undefined/null/NaN is the classic template bug and is unreadable
    // to a customer, so it must never reach either body.
    for (const [label, body] of [["html", html], ["text", text]]) {
      assert.doesNotMatch(body, /undefined|NaN|\[object Object\]/, `${key}: ${label} leaked a placeholder value`);
      assert.doesNotMatch(body, />\s*null\s*</, `${key}: ${label} leaked a null`);
    }
  }
});

test("the sample orders are arithmetically consistent, so the preview shows real totals", () => {
  for (const { key, order } of orderEmailFixtures) {
    const lines = (order.items ?? []).reduce((sum, i) => sum + (i.totalAmount ?? 0), 0);
    assert.equal(lines, order.subtotalAmount, `${key}: line items must add up to the subtotal`);
    assert.equal(
      order.subtotalAmount - (order.discountAmount ?? 0) + (order.shippingAmount ?? 0) + (order.taxAmount ?? 0),
      order.totalAmount,
      `${key}: subtotal − discount + shipping + tax must equal the total`,
    );
  }
});

// ---------------------------------------------------------------------------
// Dynamic order data
// ---------------------------------------------------------------------------

test("the order number, customer first name and every purchased line are rendered as live text", () => {
  const { order } = fixture("multiple-products");
  const { html, text } = renderOrderConfirmationEmail(order);

  assert.ok(html.includes(`ORDER #${order.orderReference}`), "the confirmation eyebrow carries the order number");
  assert.ok(html.includes("Denise, your Wynn Essentials order is in."), "the intro is personalised with the first name");
  assert.ok(!html.includes("Okafor, your"), "only the first name is used in the greeting");

  for (const item of order.items) {
    const product = catalogProductFor(item);
    assert.ok(html.includes(`${product.name} ${product.subtitle}`), `${item.name}: product name is live text`);
    assert.ok(html.includes(`Qty ${item.quantity}`), `${item.name}: quantity is live text`);
    assert.ok(html.includes(product.size), `${item.name}: size is live text`);
    assert.ok(text.includes(`${product.name} ${product.subtitle}`), `${item.name}: appears in the plain-text body`);
  }
  // Line totals and the per-unit price for a multi-quantity line.
  assert.ok(html.includes("$53.98"), "the 2 × Hydrate line total is shown");
  assert.ok(html.includes("$26.99 each"), "a multi-quantity line shows its unit price");
});

test("subtotal, discount, shipping, tax and total render with correct currency formatting", () => {
  const discounted = rendered("discounted").html;
  assert.ok(discounted.includes("$74.97"), "subtotal");
  assert.ok(discounted.includes("−$11.25"), "discount is shown as a negative amount");
  assert.ok(discounted.includes(">FREE<"), "a zero shipping charge reads as FREE");
  assert.ok(discounted.includes("$63.72"), "total");
  assert.ok(!/>Tax</.test(discounted), "no tax row when no tax was collected");

  const taxed = rendered("single-item").html;
  assert.ok(taxed.includes("$5.95"), "paid shipping is shown");
  assert.ok(taxed.includes("$1.90"), "tax is shown");
  assert.ok(taxed.includes("$27.84"), "total");
  assert.ok(/TOTAL/.test(taxed), "the total is labelled");

  // Amounts are Stripe minor units, so the formatter — not string maths — owns
  // the decimal point.
  const view = orderView({ currency: "usd", totalAmount: 100500, items: [] });
  assert.equal(view.total, "$1,005.00");
});

test("the shipping name and address are rendered, including a multiline address", () => {
  const { order } = fixture("long-values");
  const { html, text } = renderOrderConfirmationEmail(order);
  for (const line of ["Alexandria Nkechi Oyelaran-Fitzgerald", "18422 Northwest Bougainvillea Terrace Boulevard", "Building C, Suite 1180, Attn: Receiving Department", "Rancho Santa Margarita, CA 92688"]) {
    assert.ok(html.includes(line), `HTML is missing address line: ${line}`);
    assert.ok(text.includes(line), `plain text is missing address line: ${line}`);
  }
  assert.ok(html.includes("SHIPPING TO"), "the address block is labelled");
  // Long, unbreakable values must be allowed to wrap rather than widen the email.
  assert.ok(html.includes("word-break:break-word"), "long names and addresses wrap");
});

test("a missing customer name degrades to un-personalised copy", () => {
  const { html, text } = rendered("no-first-name");
  assert.ok(html.includes("Your Wynn Essentials order is in."), "copy still reads correctly without a name");
  assert.ok(!html.includes(", your Wynn Essentials order is in"), "no empty name is left dangling");
  assert.ok(text.includes("Your Wynn Essentials order is in."));
});

test("a line with no catalog match still renders its name, quantity and price", () => {
  const { html } = rendered("long-values");
  assert.ok(html.includes("Wynn Essentials Limited Edition Wash Day Gift Collection"), "the one-off product name survives");
  assert.ok(html.includes("$105.99"), "its price is shown");
  // No photo exists for it, so a plain cream placeholder stands in — never a
  // broken image.
  assert.ok(!html.includes('src=""'), "no empty image source is emitted");
});

test("selected variants and colours are shown under the product name", () => {
  const { html } = rendered("variants");
  assert.ok(html.includes("Estate Collection · Set of 4"), "the chosen scrunchie collection is shown");
  assert.ok(html.includes("Light Blue"), "the chosen bonnet colour is shown");
  assert.ok(html.includes("Qty 3"), "its quantity is shown");
});

test("tracking is rendered when it exists and omitted when it does not", () => {
  const withTracking = rendered("with-tracking").html;
  assert.ok(withTracking.includes("TRACKING"), "the tracking block appears");
  assert.ok(withTracking.includes("9400111899223197428490"), "the tracking number is live text");
  assert.ok(withTracking.includes("https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490"), "the carrier link is built");

  const withoutTracking = rendered("no-first-name").html;
  assert.ok(!withoutTracking.includes("TRACKING"), "no tracking block before a label exists");
  assert.ok(withoutTracking.includes("Tracking is next"), "the next-steps copy covers the gap instead");
});

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

test("customer- and Stripe-supplied values are HTML-escaped", () => {
  const hostile = {
    sessionId: "cs_test_escaping000000000000001",
    orderReference: 'WE-2026-"><script>alert(1)</script>',
    currency: "usd",
    customerName: '<img src=x onerror=alert(1)> "Nina" & Co',
    customerEmail: "nina@example.com",
    subtotalAmount: 1999,
    shippingAmount: 0,
    taxAmount: 0,
    totalAmount: 1999,
    shippingAddress: { name: "<b>Nina</b>", address: { line1: "1 O'Malley & Sons <Rd>", city: "Los Angeles", state: "CA", postal_code: "90001", country: "US" } },
    items: [{ productId: "prod_unknown", name: "</td></tr><script>alert(2)</script>", quantity: 1, unitAmount: 1999, totalAmount: 1999 }],
  };
  const html = orderConfirmationHtml(hostile);
  assert.ok(!html.includes("<script>"), "no injected script tag survives");
  assert.ok(!html.includes("onerror="), "no injected event handler survives");
  assert.ok(!html.includes("</td></tr><script"), "markup in a product name cannot break out of the table");
  assert.ok(html.includes("&lt;script&gt;alert(2)&lt;/script&gt;"), "the raw text is shown escaped instead");
  assert.ok(html.includes("O&#39;Malley &amp; Sons &lt;Rd&gt;"), "quotes and ampersands in an address are escaped");
  // The subject and plain-text bodies are not markup, so they carry raw text —
  // but they must not be silently dropped.
  assert.ok(orderConfirmationSubject(hostile).includes(hostile.orderReference));
  assert.ok(orderConfirmationText(hostile).includes("O'Malley & Sons"));
});

test("only a well-formed Stripe session id can reach the order-status link", () => {
  assert.equal(orderStatusUrl('cs_test_x" onmouseover="alert(1)'), null, "a malformed id is refused");
  assert.equal(orderStatusUrl("https://evil.example/steal"), null, "an arbitrary URL is refused");
  assert.equal(orderStatusUrl(null), null);
  assert.equal(orderStatusUrl("cs_live_abc123"), `${emailUrl("/order/success")}?session_id=cs_live_abc123`);
});

test("a malformed shipping address degrades to no address block instead of throwing", () => {
  for (const bad of [null, undefined, "not an object", 42, [], { address: "nope" }]) {
    assert.deepEqual(shippingLines(bad), [], `shippingLines(${JSON.stringify(bad)})`);
  }
  const html = orderConfirmationHtml({ ...fixture("single-item").order, shippingAddress: "garbage" });
  assert.ok(!html.includes("SHIPPING TO"), "the block is omitted rather than rendered empty");
  assert.ok(html.includes("QUESTIONS"), "the support block still renders");
});

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

test("every image is an absolute production URL in an email-safe format that exists in public/", () => {
  for (const { key, order } of orderEmailFixtures) {
    const tags = imgTags(orderConfirmationHtml(order));
    assert.ok(tags.length >= 3, `${key}: expected the logo, hero and wash-day images at minimum`);
    for (const tag of tags) {
      const src = attr(tag, "src");
      assert.ok(src.startsWith("https://wynnessentialsllc.us/"), `${key}: ${src} must be an absolute production URL`);
      assert.match(src, /\.(jpe?g|png|gif)$/i, `${key}: ${src} must not be WebP/AVIF (Outlook cannot render them)`);
      assert.ok(!/localhost|127\.0\.0\.1|\.vercel\.app|blob:|data:/.test(src), `${key}: ${src} must not be a temporary or preview URL`);
      assert.ok(existsSync(publicFile(new URL(src).pathname)), `${key}: ${src} is not in public/`);
      const alt = attr(tag, "alt");
      assert.ok(alt && alt.trim().length > 2, `${key}: every image needs descriptive alt text (${src})`);
    }
  }
});

test("the editorial imagery is the site's own photography, exported for email", () => {
  for (const asset of ["/email/order-confirmation-hero.jpg", "/email/wash-day-shelf.jpg", "/email/wynn-essentials-logo.png"]) {
    assert.ok(existsSync(publicFile(asset)), `${asset} must be committed to public/`);
  }
});

test("every catalog product resolves to an email-safe photo that exists on disk", () => {
  for (const product of products) {
    const image = emailImageFor(product, { name: `${product.name} — ${product.subtitle}` });
    assert.ok(image, `${product.slug}: no email-safe product photo (add a JPEG/PNG or an override)`);
    assert.match(image.src, /\.(jpe?g|png|gif)$/i, `${product.slug}: ${image.src} is not an email-safe format`);
    assert.ok(existsSync(publicFile(image.src)), `${product.slug}: ${image.src} is missing from public/`);
    assert.ok(image.alt.trim().length > 2, `${product.slug}: product photo needs alt text`);
  }
});

test("order details are still readable with images switched off", () => {
  const { order } = fixture("single-item");
  // Strip every <img> the way a blocked-image inbox effectively does.
  const withoutImages = orderConfirmationHtml(order).replace(/<img\b[^>]*>/g, "");
  for (const value of ["It&rsquo;s officially", "Lathyr Gentle Cleansing Shampoo", "$19.99", "$27.84", "HEALTHY HAIR IS A PRACTICE.", "Your first wash day", "Healthy hair is a practice."]) {
    assert.ok(withoutImages.includes(value), `"${value}" must not depend on an image`);
  }
});

// ---------------------------------------------------------------------------
// Links and buttons
// ---------------------------------------------------------------------------

test("the order button points at the customer's own secure order-status URL", () => {
  const { order } = fixture("single-item");
  const html = orderConfirmationHtml(order);
  const expected = `https://wynnessentialsllc.us/order/success?session_id=${order.sessionId}`;
  assert.ok(html.includes(`href="${expected}"`), "VIEW MY ORDER uses the session's order-status URL");
  assert.ok(html.includes("VIEW MY ORDER"), "the button is labelled as specified");
  assert.ok(orderConfirmationText(order).includes(expected), "the plain-text body carries the same link");

  // Without a usable session id the button is omitted rather than pointed at a
  // page that cannot show the order.
  const noSession = orderConfirmationHtml({ ...order, sessionId: null });
  assert.ok(!noSession.includes("VIEW MY ORDER"), "no dead order button");
  assert.ok(noSession.includes("wynnessentialsllc@gmail.com"), "support contact still reaches the customer");
});

test("every link is an absolute https or mailto URL on a Wynn destination", () => {
  for (const { key, order } of orderEmailFixtures) {
    for (const href of hrefs(orderConfirmationHtml(order))) {
      assert.match(href, /^(https:\/\/|mailto:)/, `${key}: ${href} must be absolute`);
      if (href.startsWith("https://")) {
        const host = new URL(href).host;
        assert.ok(
          host === "wynnessentialsllc.us" || /\.(usps|ups|fedex|dhl)\.com$/.test(host) || host === "tools.usps.com" || host === "www.ups.com" || host === "www.fedex.com" || host === "www.dhl.com",
          `${key}: unexpected link host ${host}`,
        );
      }
      assert.ok(!/javascript:|data:/i.test(href), `${key}: ${href} is not a safe scheme`);
    }
  }
});

test("the Wynn Method call to action links to the storefront section that exists", async () => {
  const html = rendered("single-item").html;
  assert.ok(html.includes("EXPLORE THE WYNN METHOD"), "the closing CTA is labelled as specified");
  assert.ok(html.includes('href="https://wynnessentialsllc.us/#the-wynn-method"'), "it links to The Wynn Method");
  const shop = await read("app/WynnShop.tsx");
  assert.ok(shop.includes('id="the-wynn-method"'), "the storefront still has that anchor");
});

// ---------------------------------------------------------------------------
// Email-client safety
// ---------------------------------------------------------------------------

test("the markup stays inside what email clients support", () => {
  const html = rendered("multiple-products").html;
  for (const banned of ["<script", "<form", "<video", "<iframe", "<input", "position:absolute", "position:fixed", "float:left", "float:right", "display:flex", "display:grid"]) {
    assert.ok(!html.toLowerCase().includes(banned), `${banned} is not safe in email`);
  }
  // Layout is table-based and every visual style is inline; the <style> block
  // only carries the mobile media query.
  assert.ok((html.match(/<table/g) || []).length > 8, "the layout is table-based");
  assert.equal((html.match(/<style/g) || []).length, 1, "one <style> block");
  assert.ok(!/background-image/.test(html), "no layout depends on a background image");
  assert.ok(!/url\(/.test(html), "no CSS-referenced imagery");
});

test("the email is 600px wide on desktop and fluid on a phone", () => {
  const html = rendered("single-item").html;
  assert.ok(html.includes('width="600"'), "a 600px content table for Outlook");
  assert.ok(html.includes("max-width:600px"), "and a max-width for everything else");
  assert.ok(html.includes("@media only screen and (max-width:620px)"), "a mobile breakpoint exists");
  assert.ok(html.includes(".stack{display:block!important"), "two-column blocks stack on a phone");
  assert.ok(html.includes('name="viewport"'), "the viewport meta is present");
});

test("buttons give a phone-sized tap target", () => {
  const html = rendered("single-item").html;
  // 16px of vertical padding either side of a 16px line box clears the 44px
  // minimum comfortably.
  assert.ok(html.includes("padding:16px 30px"), "buttons are padded for touch");
});

test("the transactional footer carries the legally required information", () => {
  const { html, text } = rendered("single-item");
  for (const body of [html, text]) {
    assert.ok(body.includes("Wynn Essentials, LLC"), "the legal entity");
    assert.ok(body.includes("3680 Wilshire Blvd."), "the physical mailing address");
    assert.ok(body.includes("Los Angeles, CA 90010"), "city, state and ZIP");
    assert.ok(body.includes("wynnessentialsllc@gmail.com"), "a working support contact");
    assert.ok(/transactional message about your purchase/.test(body), "the message is identified as transactional");
    assert.ok(body.includes("BLACK WOMEN-OWNED"), "the brand footer line");
  }
  // A receipt is transactional, so it must NOT carry a marketing unsubscribe.
  assert.ok(!html.includes("/unsubscribe?"), "no marketing unsubscribe link on a receipt");
});

test("the approved creative copy is present, in order", () => {
  const html = rendered("single-item").html;
  const sequence = [
    "CONFIRMED",
    "It&rsquo;s officially",
    "on the way.",
    "Wynn Essentials order is in.",
    "HEALTHY HAIR IS A PRACTICE.",
    "WHAT YOU ORDERED",
    "Your essentials, confirmed.",
    "FROM ORDER TO ROUTINE",
    "Here&rsquo;s what happens next.",
    "Packed with intention",
    "Tracking is next",
    "Then, make it your practice",
    "WHEN YOUR BOX ARRIVES",
    "Your first wash day, made simple.",
    "Cleanse",
    "Condition",
    "Moisturize",
    "A LITTLE MORE THAN A RECEIPT",
    "Care begins before delivery.",
    "Explore The Wynn Method while your order travels.",
    "EXPLORE THE WYNN METHOD",
    "Healthy hair is a practice.",
    "BLACK WOMEN-OWNED &middot; LOS ANGELES &middot; EST. 2020",
  ];
  let cursor = 0;
  for (const phrase of sequence) {
    const at = html.indexOf(phrase, cursor);
    assert.ok(at >= 0, `missing (or out of order) copy: ${phrase}`);
    cursor = at;
  }
});

test("the brand palette comes from the storefront's own stylesheet", async () => {
  const css = await read("app/globals.css");
  const html = rendered("single-item").html;
  for (const [name, value] of [["sky blue", "#7bc8ef"], ["accent pink", "#ff65a8"], ["warm cream", "#f4eadc"]]) {
    assert.ok(css.includes(value), `${name} ${value} must be a value the website already uses`);
    assert.ok(html.includes(value), `${name} ${value} must be used in the email`);
  }
  assert.ok(html.includes("Georgia,'Times New Roman',Times,serif"), "editorial serif with email-safe fallbacks");
  assert.ok(html.includes("Arial,Helvetica,sans-serif"), "clean sans-serif with email-safe fallbacks");
});

test("the plain-text alternative is plain text and carries the whole order", () => {
  const { order } = fixture("multiple-products");
  const text = orderConfirmationText(order);
  assert.ok(!/<[a-z/]/i.test(text), "no markup in the text body");
  assert.ok(!/&(amp|lt|gt|quot|#39|rsquo|middot);/.test(text), "no HTML entities in the text body");
  for (const value of ["ORDER #WE-2026-SAMPLE02", "Hydrate Herbal Hair Mist", "Qty 2", "$53.98", "TOTAL: $177.35", "Denise Okafor", "4402 W Slauson Ave"]) {
    assert.ok(text.includes(value), `plain text is missing: ${value}`);
  }
});

// ---------------------------------------------------------------------------
// Sending path — unchanged behaviour
// ---------------------------------------------------------------------------

test("notifyCustomerOrderConfirmation sends the new template, with a text part, exactly once", async () => {
  const priorKey = process.env.RESEND_API_KEY;
  const priorFetch = globalThis.fetch;
  const calls = [];
  process.env.RESEND_API_KEY = "re_test_key_not_a_real_credential";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => "" };
  };
  try {
    const { notifyCustomerOrderConfirmation } = await import("../lib/notify.ts");
    const { order } = fixture("single-item");

    assert.equal(await notifyCustomerOrderConfirmation({ ...order, customerEmail: null }), false, "no email address, no send");
    assert.equal(calls.length, 0);

    assert.equal(await notifyCustomerOrderConfirmation(order), true);
    assert.equal(calls.length, 1, "exactly one Resend request per call");
    const [{ url, body }] = calls;
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(body.to, order.customerEmail);
    assert.equal(body.subject, orderConfirmationSubject(order));
    assert.equal(body.html, orderConfirmationHtml(order), "the shipped template is what gets sent");
    assert.equal(body.text, orderConfirmationText(order), "a plain-text alternative is included");
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = priorKey;
  }
});

test("the confirmation is still sent from one place, behind the existing idempotency guards", async () => {
  const webhook = await read("app/api/stripe/webhook/route.ts");
  const reconcile = await read("app/api/cron/reconcile-orders/route.ts");
  const notify = await read("lib/notify.ts");

  // The webhook only emails after claiming the Stripe event id, and the
  // reconcile cron only after a fresh insert. Both must keep calling the single
  // notify entry point rather than rendering an email themselves.
  assert.match(webhook, /if \(status === "paid" && \(await claimEvent\(db, event, sessionId\)\)\) \{[\s\S]*notifyCustomerOrderConfirmation/);
  assert.match(reconcile, /if \(!inserted\.length\) continue;[\s\S]*notifyCustomerOrderConfirmation/);
  for (const [name, src] of [["webhook", webhook], ["reconcile", reconcile]]) {
    assert.doesNotMatch(src, /order-confirmation-email/, `${name} must not build the email itself`);
  }
  assert.equal((notify.match(/export async function notifyCustomerOrderConfirmation/g) || []).length, 1, "one confirmation sender");
  assert.match(notify, /renderOrderConfirmationEmail\(order\)/, "it renders through the shared template");
});
