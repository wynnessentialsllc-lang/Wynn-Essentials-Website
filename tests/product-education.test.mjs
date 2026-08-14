// The post-purchase product-education email: the content, the selection, the
// rendering, and the once-per-order guarantee behind it.
//
// The claim rule this suite is really protecting: an education entry may not
// say more about a product than app/data.ts already says, and the usage
// guidance must be the catalog's own `directions` string rather than a second
// copy that can drift from the label.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

process.env.UNSUBSCRIBE_SECRET ??= "test-only-not-a-real-secret";
delete process.env.NEXT_PUBLIC_SITE_URL;

const { products } = await import("../app/data.ts");
const { productEducation, educationFor } = await import("../lib/product-education.ts");
const { productEducationEmail, educationSubject } = await import("../lib/product-education-email.ts");
const { educationFixtures } = await import("../lib/product-education-fixtures.ts");

const SITE = "https://wynnessentialsllc.us";
const cardsFor = (...slugs) => educationFor(
  slugs.map(slug => ({ productId: products.find(p => p.slug === slug)?.stripeProductId ?? null })),
  SITE,
);
const render = (cards, extra = {}) => productEducationEmail({
  email: "customer@example.com", customerName: "Alicia Moore", orderReference: "WE-1042", cards, ...extra,
});

// --- the content -----------------------------------------------------------

test("every product in the catalog has education written for it", () => {
  for (const product of products) {
    const entry = productEducation[product.slug];
    assert.ok(entry, `${product.slug} has no education entry — it would arrive with nothing to say about it`);
    assert.ok(entry.whatItIs.length > 30, `${product.slug}: whatItIs is too thin to be useful`);
    assert.ok(entry.whatItDoes.length > 30, `${product.slug}: whatItDoes is too thin to be useful`);
    assert.ok(entry.rhythm.length > 10, `${product.slug}: no rhythm`);
    assert.ok(entry.scenarios.length >= 2, `${product.slug}: fewer than two scenarios`);
    for (const s of entry.scenarios) {
      assert.ok(s.when.length > 10 && s.then.length > 20, `${product.slug}: a scenario is too thin`);
    }
  }
});

test("no education entry states a result, a timeframe, or a measured outcome", () => {
  // The catalog never promises growth, repair, or a deadline, so neither may
  // this. Phrases are matched loosely on purpose — the point is to catch the
  // shape of an unverifiable claim, not one exact wording.
  const forbidden = [
    /\bguarantee/i, /\bclinically\b/i, /\bproven\b/i, /\bcures?\b/i, /\bheals?\b/i,
    /\brepairs?\b/i, /\breverses?\b/i, /\bregrow/i,
    // Not the word "inches" — the braiding hair genuinely is 18 inches. What is
    // banned is a measured amount of GROWTH.
    /\bgrows?\b[^.]{0,40}\d+\s*(?:inch|inches|cm)\b/i,
    /\b\d+\s*(?:inch|inches|cm)\b[^.]{0,20}\b(?:of growth|longer|more hair)\b/i,
    /\bin (?:just )?\d+\s*(?:day|week|month)/i, /\bresults? in\b/i, /\bwill grow\b/i,
    /\bstops? (?:hair )?loss\b/i, /\beliminates?\b/i, /\bpermanent/i,
  ];
  for (const [slug, entry] of Object.entries(productEducation)) {
    const prose = [entry.whatItIs, entry.whatItDoes, entry.rhythm, entry.pairsWith ?? "", entry.goEasy ?? "",
      ...entry.scenarios.flatMap(s => [s.when, s.then])].join(" ");
    for (const pattern of forbidden) {
      assert.doesNotMatch(prose, pattern, `${slug} makes a claim nothing verifies: ${pattern}`);
    }
  }
});

test("the catalog's own directions are what the email teaches, verbatim", () => {
  // Usage guidance has exactly one source. If this fails, someone has written a
  // second copy of the instructions that can drift from the label.
  for (const product of products.filter(p => productEducation[p.slug])) {
    // A bundle expands into its contents, so it never renders as itself.
    const card = cardsFor(product.slug).find(c => c.slug === product.slug);
    if (!card) continue;
    assert.equal(card.directions, product.directions, `${product.slug}: directions are not the catalog's`);
    const { html, text } = render([card]);
    // A couple of directions strings contain an en dash or an apostrophe, so
    // compare on the escaped form the renderer actually emits.
    const escaped = product.directions.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    assert.ok(html.includes(escaped), `${product.slug}: directions missing from the HTML`);
    assert.ok(text.includes(product.directions), `${product.slug}: directions missing from the plain text`);
  }
});

// --- which sections an order gets ------------------------------------------

test("an order's products are emailed in Wynn Method order, whatever order they were bought in", () => {
  const cards = cardsFor("nourish-oil", "lathyr-shampoo", "uplyft-conditioner");
  assert.deepEqual(cards.map(c => c.slug), ["lathyr-shampoo", "uplyft-conditioner", "nourish-oil"]);
});

test("a bundle expands into the products inside it", () => {
  const cards = cardsFor("hair-wellness-bundle");
  assert.deepEqual(cards.map(c => c.name), ["Lathyr", "Uplyft", "Hydrate", "Nourish"]);
});

test("a product bought twice, or inside a bundle and again on its own, gets one section", () => {
  const cards = cardsFor("hair-wellness-bundle", "hydrate-herbal-hair-mist", "hydrate-herbal-hair-mist");
  assert.equal(cards.filter(c => c.slug === "hydrate-herbal-hair-mist").length, 1);
  assert.equal(new Set(cards.map(c => c.slug)).size, cards.length);
});

test("line items that match nothing in the catalog are left out, not guessed at", () => {
  assert.deepEqual(educationFor([{ productId: "prod_does_not_exist" }, { productId: null }, {}], SITE), []);
});

test("only JPEG and PNG photography is mailed, since WebP breaks in Outlook", () => {
  for (const card of cardsFor(...products.map(p => p.slug))) {
    if (!card.image) continue;
    assert.match(card.image.src, /\.(jpe?g|png)$/i, `${card.slug} would mail an image no Outlook client can render`);
  }
});

test("a product with no mailable photograph still renders", () => {
  const cards = cardsFor("soft-life-bonnet");
  assert.equal(cards.length, 1);
  const { html } = render(cards);
  assert.ok(html.includes("Soft Life Bonnet"));
  assert.doesNotMatch(html, /<img[^>]+\.(webp|avif)/i);
});

// --- the message itself ----------------------------------------------------

test("the message is a complete, email-safe document with a plain-text alternative", () => {
  for (const fixture of educationFixtures) {
    const cards = educationFor(fixture.items, SITE);
    const { subject, preheader, html, text } = render(cards, {
      customerName: fixture.customerName, orderReference: fixture.orderReference,
    });
    assert.match(html, /^<!doctype html>/i, `${fixture.key}: not a complete document`);
    assert.ok(subject.length > 8, `${fixture.key}: no subject`);
    assert.ok(preheader.length > 8, `${fixture.key}: no preview text`);
    assert.ok(text.length > 400, `${fixture.key}: no usable plain text`);
    // The shared brand foundation, same as the other three customer emails.
    assert.ok(html.includes("/email/wynn-essentials-logo.png"), `${fixture.key}: not using the shared logo`);
    assert.match(html, /width="600"[^>]*style="width:600px;max-width:600px/, `${fixture.key}: not the 600px shell`);
    assert.match(html, /@media only screen and \(max-width:620px\)/, `${fixture.key}: no mobile rules`);
    assert.match(html, /Wynn Essentials, LLC · 3680 Wilshire Blvd\., Ste P04 A118, Los Angeles, CA 90010/, `${fixture.key}: no mailing address`);
    assert.doesNotMatch(html, /<script\b/i, `${fixture.key}: script in an email`);
    // Absolute production URLs only — an email is opened long after it is sent.
    assert.doesNotMatch(html, /localhost|127\.0\.0\.1|\.vercel\.app/i, `${fixture.key}: non-production URL`);
    assert.doesNotMatch(html, /src="\//, `${fixture.key}: relative image URL`);
  }
});

test("even an order of every product stays under Gmail's clipping limit", () => {
  const cards = educationFor(products.map(p => ({ productId: p.stripeProductId ?? null })), SITE);
  assert.ok(cards.length >= 12, "the worst case should carry most of the catalog");
  const { html } = render(cards);
  assert.ok(Buffer.byteLength(html, "utf8") < 102_000, `Gmail clips over ~102KB; this is ${Buffer.byteLength(html, "utf8")}`);
});

test("it sells nothing: no offer, no discount code, no cross-sell", () => {
  const cards = educationFor(products.map(p => ({ productId: p.stripeProductId ?? null })), SITE);
  const { html, text, subject } = render(cards);
  for (const body of [html, text, subject]) {
    assert.doesNotMatch(body, /WELCOME15|discount|% off|promo code|coupon/i);
    assert.doesNotMatch(body, /you might also like|complete your routine|add to (?:cart|bag)/i);
  }
  // The only links are the products she already owns, the method, the site,
  // the support mailbox, and the opt-out.
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  for (const href of links) {
    assert.match(
      href,
      /^(mailto:|https:\/\/wynnessentialsllc\.us\/(products\/[a-z0-9-]+|#the-wynn-method|unsubscribe\?|$))/,
      `unexpected link in an education email: ${href}`,
    );
  }
});

test("each section links to that product's own page", () => {
  const cards = cardsFor("hydrate-herbal-hair-mist", "grow-oil");
  const { html, text } = render(cards);
  for (const card of cards) {
    assert.equal(card.url, `${SITE}/products/${card.slug}`);
    assert.ok(html.includes(`href="${card.url}"`), `${card.slug}: no link to its product page`);
    assert.ok(text.includes(card.url), `${card.slug}: no link in the plain text`);
  }
});

test("the subject names the product when there is only one, and stays general when there are several", () => {
  assert.equal(educationSubject(cardsFor("hydrate-herbal-hair-mist")), "How to get the most from your Hydrate");
  assert.equal(educationSubject(cardsFor("hydrate-herbal-hair-mist", "grow-oil")), "How to get the most from your Wynn Essentials");
});

test("a customer with no name on the order is greeted, not addressed to a blank", () => {
  const { html, text } = render(cardsFor("grow-oil"), { customerName: null });
  assert.ok(html.includes("Hi there"), "no fallback greeting in the HTML");
  assert.ok(text.includes("Hi there"), "no fallback greeting in the plain text");
  assert.doesNotMatch(html, /Hi\s*(?:&mdash;|,|<)/, "greeting rendered with an empty name");
});

test("customer-supplied text cannot inject markup", () => {
  const { html } = render(cardsFor("grow-oil"), {
    customerName: '<script>alert(1)</script>Eve',
    orderReference: '"><img src=x onerror=alert(1)>',
  });
  assert.doesNotMatch(html, /<script>alert/i);
  assert.doesNotMatch(html, /<img[^>]*onerror/i);
  assert.match(html, /&lt;script&gt;/);
});

// --- the once-per-order guarantee ------------------------------------------

test("the cron claims an order before it composes anything, and only releases a certain failure", async () => {
  const cron = await readFile(new URL("../app/api/cron/product-education/route.ts", import.meta.url), "utf8");

  // Authorisation: not publicly triggerable.
  assert.match(cron, /if \(!process\.env\.CRON_SECRET\) return NextResponse\.json\(\{ error: "CRON_SECRET is not set\." \}, \{ status: 503 \}\)/);
  assert.match(cron, /if \(!authorized\(request\)\) return NextResponse\.json\(\{ error: "Unauthorized\." \}, \{ status: 401 \}\)/);

  // Only paid orders, only unsent ones, only with an address to send to.
  assert.match(cron, /eq\(orders\.status, "paid"\)/);
  assert.match(cron, /isNull\(orders\.educationSentAt\)/);
  assert.match(cron, /isNotNull\(orders\.customerEmail\)/);

  // The claim is the WHERE clause, so two overlapping runs cannot both send.
  assert.match(cron, /\.set\(\{ educationSentAt: new Date\(\), updatedAt: new Date\(\) \}\)[\s\S]{0,160}isNull\(orders\.educationSentAt\)[\s\S]{0,80}\.returning\(/);
  assert.match(cron, /if \(claimed\.length === 0\) \{ skipped\+\+; continue; \}/);
  // ...and it is taken before the email is built, not after.
  assert.ok(cron.indexOf("const claimed") < cron.indexOf("educationFor(items"), "the order is claimed after composing — a crash mid-send could double-send");

  // A claim is released only when nothing can have been transmitted.
  assert.match(cron, /if \(delivery\.certainNotSent\) \{[\s\S]{0,200}educationSentAt: null/);
});

test("the timing clears the delivery window we advertise, and precedes the review request", async () => {
  const education = await readFile(new URL("../app/api/cron/product-education/route.ts", import.meta.url), "utf8");
  const reviews = await readFile(new URL("../app/api/cron/review-requests/route.ts", import.meta.url), "utf8");
  const days = (source, name) => Number(source.match(new RegExp(`const ${name} = envDays\\("[A-Z_]+", (\\d+)\\)`))?.[1]);

  const eduShip = days(education, "AFTER_SHIP_MS"), eduOrder = days(education, "AFTER_ORDER_MS");
  const revShip = days(reviews, "AFTER_SHIP_MS"), revOrder = days(reviews, "AFTER_ORDER_MS");
  for (const [name, value] of Object.entries({ eduShip, eduOrder, revShip, revOrder })) {
    assert.ok(Number.isFinite(value), `${name}: could not read the default out of the cron`);
  }

  // The standard and free Stripe shipping rates advertise 3–7 BUSINESS days
  // (scripts/setup-stripe.mjs), which is 9–11 calendar days at the slow end and
  // about 7 for a typical 5-business-day delivery. Anything under 8 calendar
  // days starts landing while parcels are still moving.
  assert.ok(eduShip >= 8, "too early — a standard-shipping parcel may still be in transit");
  assert.ok(revShip >= 14, "the review request must clear the advertised window too");
  // Learn what you bought, use it, then be asked what you thought.
  assert.ok(eduShip < revShip, "the education email must arrive before the review request");
  assert.ok(eduOrder < revOrder, "the unshipped fallback must also precede the review request");
  assert.ok(revShip - eduShip >= 5, "leave at least a few days of use between being taught and being asked");
});

test("a broken timing override can never collapse into sending immediately", async () => {
  const { envDays } = await import("../lib/cron-timing.ts");
  const DAY = 24 * 60 * 60 * 1000;
  const key = "TEST_TIMING_DAYS";
  try {
    for (const bad of [undefined, "", "   ", "soon", "0", "-3", "NaN", "Infinity"]) {
      if (bad === undefined) delete process.env[key]; else process.env[key] = bad;
      assert.equal(envDays(key, 9), 9 * DAY, `"${bad}" should have fallen back to the default`);
    }
    process.env[key] = "4";
    assert.equal(envDays(key, 9), 4 * DAY, "a valid override should be honoured");
  } finally {
    delete process.env[key];
  }
});

test("the education email is scheduled, and not at the same hour as the review request", async () => {
  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const paths = Object.fromEntries(vercel.crons.map(c => [c.path, c.schedule]));
  assert.ok(paths["/api/cron/product-education"], "the cron is not scheduled");
  assert.notEqual(paths["/api/cron/product-education"], paths["/api/cron/review-requests"]);
});

test("the send-once column exists in both the schema and a migration", async () => {
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  assert.match(schema, /educationSentAt: timestamp\("education_sent_at"/);
  const migration = await readFile(new URL("../drizzle/0018_product_education.sql", import.meta.url), "utf8");
  assert.match(migration, /ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "education_sent_at" timestamptz/);
});

test("the sender refuses an empty order and never one-clicks an opt-out", async () => {
  const notify = await readFile(new URL("../lib/notify.ts", import.meta.url), "utf8");
  const fn = notify.slice(notify.indexOf("export async function notifyProductEducation"), notify.indexOf("// Post-purchase review request"));
  assert.match(fn, /if \(!input\.email \|\| input\.cards\.length === 0\) return \{ ok: false, certainNotSent: true \}/);
  // One-click belongs on bulk marketing only: a mailbox scanner must not be
  // able to opt someone out by opening a message about their own order.
  assert.doesNotMatch(fn, /oneClick/);
  assert.match(fn, /canSignUnsubscribe\(\) \? \{ headers: listUnsubscribeHeaders\(input\.email\) \}/);
});

test("without a signing secret the opt-out line is dropped rather than rendered dead", async () => {
  const { canSignUnsubscribe } = await import("../lib/unsubscribe.ts");
  assert.equal(canSignUnsubscribe(), true, "this test needs the secret set at the top of the file");
  const withSecret = render(cardsFor("grow-oil")).html;
  assert.match(withSecret, /unsubscribe\?e=/);

  // Re-import the renderer in a child process with no secret configured, since
  // the module reads it through lib/unsubscribe at call time.
  const { execFileSync } = await import("node:child_process");
  const mod = name => new URL(`../${name}`, import.meta.url).href;
  const script = `
    delete process.env.UNSUBSCRIBE_SECRET;
    const { products } = await import(${JSON.stringify(mod("app/data.ts"))});
    const { educationFor } = await import(${JSON.stringify(mod("lib/product-education.ts"))});
    const { productEducationEmail } = await import(${JSON.stringify(mod("lib/product-education-email.ts"))});
    const cards = educationFor([{ productId: products.find(p => p.slug === "grow-oil").stripeProductId }], "https://wynnessentialsllc.us");
    const { html, text } = productEducationEmail({ email: "c@example.com", cards });
    console.log(JSON.stringify({ html: /unsubscribe/i.test(html), text: /unsubscribe/i.test(text) }));
  `;
  // Same loader the suite itself runs under — the catalog uses extensionless
  // TypeScript imports, which bare node cannot resolve.
  const loader = new URL("./hwl-loader-register.mjs", import.meta.url).href;
  const out = execFileSync(process.execPath, ["--experimental-strip-types", "--import", loader, "--input-type=module", "--eval", script], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  const result = JSON.parse(out.trim().split("\n").pop());
  assert.equal(result.html, false, "a dead unsubscribe link was rendered into the HTML");
  assert.equal(result.text, false, "a dead unsubscribe link was rendered into the plain text");
});
