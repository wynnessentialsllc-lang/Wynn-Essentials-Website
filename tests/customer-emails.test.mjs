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

test("every product has a photograph an email client can actually render", async () => {
  // Outlook for Windows renders neither WebP nor AVIF, and six of the catalog's
  // products are shot only in those, so `npm run email:images` builds a JPEG per
  // product. If this fails, that command has not been re-run since the catalog
  // changed — and those products would mail an empty square.
  const { existsSync, statSync } = await import("node:fs");
  for (const product of products) {
    const image = mailableImage(product.slug);
    assert.ok(image, `${product.slug} has no email photograph at all`);
    assert.equal(image.src, `/email/products/${product.slug}.jpg`);
    assert.ok(image.alt.length > 5, `${product.slug}: the photograph has no useful alt text`);
    const file = new URL(`../public${image.src}`, import.meta.url);
    assert.ok(existsSync(file), `${product.slug}: ${image.src} is referenced but not built — run npm run email:images`);
    // Small enough to sit in an inbox; big enough to be a photograph.
    const bytes = statSync(file).size;
    assert.ok(bytes > 2_000, `${product.slug}: ${image.src} is only ${bytes}b`);
    assert.ok(bytes < 80_000, `${product.slug}: ${image.src} is ${Math.round(bytes / 1024)}KB — too heavy for an email row`);
  }
  assert.equal(mailableImage("not-a-product"), null);
  assert.equal(mailableImage(null), null);
});

test("the education email uses the same built photographs", async () => {
  const { educationFor } = await import("../lib/product-education.ts");
  const { existsSync } = await import("node:fs");
  const cards = educationFor(products.map(p => ({ productId: p.stripeProductId ?? null })), "https://wynnessentialsllc.us");
  assert.ok(cards.length >= 12);
  for (const card of cards) {
    assert.ok(card.image, `${card.slug} has no photograph in its education section`);
    assert.equal(card.image.src, `/email/products/${card.slug}.jpg`);
    assert.ok(existsSync(new URL(`../public${card.image.src}`, import.meta.url)), `${card.slug}: photograph not built`);
  }
});

test("a WebP-only product still mails a photograph, and no format Outlook rejects", () => {
  // The Soft Life Bonnet is photographed only in WebP. Before the email build it
  // rendered as an empty square.
  const html = productLine({ name: "Soft Life Bonnet", meta: "Qty 1", amount: "$19.99", image: mailableImage("soft-life-bonnet") });
  assert.ok(html.includes("Soft Life Bonnet"));
  assert.match(html, /<img[^>]+\/email\/products\/soft-life-bonnet\.jpg/);
  assert.doesNotMatch(html, /<img[^>]+\.(webp|avif)/i);
});

test("a line with no photograph at all still renders", () => {
  const html = productLine({ name: "Something", meta: "Qty 1", image: null });
  assert.ok(html.includes("Something"));
  assert.doesNotMatch(html, /<img/i);
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

test("a preview deployment never becomes the origin an email's images point at", async () => {
  // Preview URLs are https and parse fine, but Vercel protects them: a mail
  // client fetching an image gets a login page, and every photograph breaks.
  const { execFileSync } = await import("node:child_process");
  const loader = new URL("./hwl-loader-register.mjs", import.meta.url).href;
  const mod = new URL("../lib/email-brand.ts", import.meta.url).href;
  const script = `
    const results = {};
    for (const origin of ["https://wynn-essentials-website-abc123.vercel.app", "http://localhost:3000", "https://192.168.1.5", "https://wynnessentialsllc.us", ""]) {
      process.env.NEXT_PUBLIC_SITE_URL = origin;
      const { emailOrigin } = await import(${JSON.stringify(mod)} + "?v=" + encodeURIComponent(origin));
      results[origin || "(unset)"] = emailOrigin();
    }
    console.log(JSON.stringify(results));
  `;
  const out = execFileSync(process.execPath, ["--experimental-strip-types", "--import", loader, "--input-type=module", "--eval", script], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  const resolved = JSON.parse(out.trim().split("\n").pop());
  assert.equal(resolved["https://wynn-essentials-website-abc123.vercel.app"], "https://wynnessentialsllc.us", "a preview URL became the image origin");
  assert.equal(resolved["http://localhost:3000"], "https://wynnessentialsllc.us");
  assert.equal(resolved["https://192.168.1.5"], "https://wynnessentialsllc.us");
  assert.equal(resolved["(unset)"], "https://wynnessentialsllc.us");
  // A real configured origin is still honoured.
  assert.equal(resolved["https://wynnessentialsllc.us"], "https://wynnessentialsllc.us");
});
