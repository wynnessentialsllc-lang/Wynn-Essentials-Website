// The five shorter customer emails, and the branded shell they share.
//
// What this suite is really protecting: that no customer-facing message can go
// back to the plain Arial block these were rescued from. Every one of them now
// renders on the same foundation as the order confirmation — logo band, sky
// opening, pink rule, black brand footer — and a message that quietly stopped
// doing so would look like a different company's email.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

process.env.UNSUBSCRIBE_SECRET ??= "test-only-not-a-real-secret";
delete process.env.NEXT_PUBLIC_SITE_URL;

const { customerEmail, productLine, totalLine, detailRows, noteCard, mailableImage } = await import("../lib/customer-email.ts");
const { products } = await import("../app/data.ts");

const base = {
  subject: "A subject line",
  preheader: "The preview line.",
  eyebrow: "AN EYEBROW",
  heading: "A heading",
  intro: "An opening paragraph.",
  text: "The plain-text body.",
};

// --- the shell ---------------------------------------------------------------

test("the shell is the same foundation as the other branded emails", () => {
  const { html } = customerEmail(base);
  assert.match(html, /^<!doctype html>/i);
  assert.ok(html.includes("/email/wynn-essentials-logo.png"), "not using the shared logo");
  assert.match(html, /width="600"[^>]*style="width:600px;max-width:600px/, "not the 600px shell");
  assert.match(html, /@media only screen and \(max-width:620px\)/, "no mobile rules");
  assert.match(html, /Wynn Essentials, LLC · 3680 Wilshire Blvd\., Ste P04 A118, Los Angeles, CA 90010/, "no mailing address");
  assert.match(html, /Healthy hair is a practice\./, "no brand footer");
  assert.match(html, /background-color:#7bc8ef/, "no sky opening block");
  assert.match(html, /background-color:#ff65a8/, "no pink rule");
  assert.doesNotMatch(html, /<script\b/i);
  // Absolute production URLs only — an email is opened long after it is sent.
  assert.doesNotMatch(html, /localhost|127\.0\.0\.1|\.vercel\.app/i);
  assert.doesNotMatch(html, /src="\//);
});

test("the preview line is set, and a plain-text alternative always exists", () => {
  const { html, text } = customerEmail(base);
  assert.ok(html.includes("The preview line."), "no preheader in the markup");
  assert.ok(text.includes("The plain-text body."), "the body is missing from the plain text");
  assert.ok(text.includes("Healthy hair is a practice."), "the plain text has no sign-off");
  assert.ok(text.length > 300, "the plain text is too thin to stand in for the HTML");
});

test("marketing mail carries an opt-out; a message about an order says why it has none", () => {
  const marketing = customerEmail({ ...base, unsubscribeEmail: "customer@example.com" });
  // `&` is escaped to `&amp;` inside an HTML attribute, which is correct.
  assert.match(marketing.html, /unsubscribe\?e=customer%40example\.com&amp;t=/);
  assert.match(marketing.text, /Unsubscribe: https:/);

  const transactional = customerEmail(base);
  // No LINK — the footer explains why there is nothing to leave, which is
  // allowed to use the word.
  assert.doesNotMatch(transactional.html, /href="[^"]*unsubscribe/i);
  assert.match(transactional.html, /transactional message about your order/);
});

test("without a signing secret the opt-out is dropped rather than rendered dead", async () => {
  const { execFileSync } = await import("node:child_process");
  const loader = new URL("./hwl-loader-register.mjs", import.meta.url).href;
  const mod = new URL("../lib/customer-email.ts", import.meta.url).href;
  const script = `
    delete process.env.UNSUBSCRIBE_SECRET;
    const { customerEmail } = await import(${JSON.stringify(mod)});
    const { html, text } = customerEmail({ subject: "s", preheader: "p", eyebrow: "E", heading: "H", intro: "i", text: "t", unsubscribeEmail: "customer@example.com" });
    console.log(JSON.stringify({ html: /href="[^"]*unsubscribe/i.test(html), text: /Unsubscribe: http/.test(text) }));
  `;
  const out = execFileSync(process.execPath, ["--experimental-strip-types", "--import", loader, "--input-type=module", "--eval", script], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  const result = JSON.parse(out.trim().split("\n").pop());
  assert.equal(result.html, false, "a dead unsubscribe link reached the HTML");
  assert.equal(result.text, false, "a dead unsubscribe link reached the plain text");
});

// --- the blocks --------------------------------------------------------------

test("only JPEG and PNG photography is mailed, since WebP breaks in Outlook", () => {
  for (const product of products) {
    const image = mailableImage(product.slug);
    if (image) assert.match(image.src, /\.(jpe?g|png)$/i, `${product.slug} would mail an unsupported image`);
  }
  assert.equal(mailableImage("not-a-product"), null);
  assert.equal(mailableImage(null), null);
});

test("a line with no photograph still renders, and never as a broken image", () => {
  const html = productLine({ name: "Soft Life Bonnet", meta: "Qty 1", amount: "$19.99", image: mailableImage("soft-life-bonnet") });
  assert.ok(html.includes("Soft Life Bonnet"));
  assert.doesNotMatch(html, /<img[^>]+\.(webp|avif)/i);
});

test("customer- and catalog-supplied text cannot inject markup", () => {
  const hostile = '<script>alert(1)</script>"><img src=x onerror=alert(1)>';
  for (const html of [
    productLine({ name: hostile, meta: hostile, amount: hostile }),
    totalLine(hostile, hostile),
    detailRows([{ label: hostile, value: hostile }]),
    customerEmail({ ...base, subject: hostile, preheader: hostile }).html,
  ]) {
    assert.doesNotMatch(html, /<script>alert/i);
    assert.doesNotMatch(html, /<img[^>]*onerror/i);
  }
});

// --- every message uses it ---------------------------------------------------

test("no customer email is left on the old plain block", async () => {
  const notify = await readFile(new URL("../lib/notify.ts", import.meta.url), "utf8");
  assert.doesNotMatch(notify, /customerShell/, "the plain Arial shell is back");
  // Each of the five composes through the shared branded shell.
  for (const fn of [
    "notifySubscriberWelcome",
    "notifyAbandonedCart",
    "notifyCustomerRestock",
    "notifyCustomerShipped",
    "notifyReviewRequest",
  ]) {
    const start = notify.indexOf(`export async function ${fn}`);
    assert.ok(start > -1, `${fn} is gone`);
    const body = notify.slice(start, start + 2600);
    assert.match(body, /customerEmail\(\{/, `${fn} does not render the branded shell`);
    assert.match(body, /text: message\.text/, `${fn} sends no plain-text alternative`);
  }
});

test("the abandoned-cart reminder shows what is in the bag, with photographs", async () => {
  const notify = await readFile(new URL("../lib/notify.ts", import.meta.url), "utf8");
  const body = notify.slice(notify.indexOf("export async function notifyAbandonedCart"), notify.indexOf("export async function notifyCustomerRestock"));
  assert.match(body, /productLine\(\{/, "the items are not rendered as product lines");
  assert.match(body, /image: mailableImage\(i\.slug\)/, "no photograph is looked up for a cart line");
  assert.match(body, /totalLine\("Subtotal"/, "no subtotal");
  // The offer is still only mentioned when there is a live one to mention.
  assert.match(body, /promoCode\s*\?/);
});

test("the slug the photographs need is carried all the way from storage", async () => {
  const cart = await readFile(new URL("../app/api/cron/abandoned-carts/route.ts", import.meta.url), "utf8");
  assert.match(cart, /type CartItem = \{ slug\?: string \| null;/, "the cron drops the slug before the email sees it");
  const reviews = await readFile(new URL("../app/api/cron/review-requests/route.ts", import.meta.url), "utf8");
  assert.match(reviews, /url: `\$\{commerceConfig\.siteUrl\}\/products\/\$\{slug\}`, slug \}/, "the review request has no slug for its photographs");
});
