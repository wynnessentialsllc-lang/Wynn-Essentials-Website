// The Wynn Edit signup + welcome email, end to end through the real route
// handler and the real email composer.
//
// Nothing here reaches the network or a database: the subscribers table is the
// in-memory stub (tests/subscribers-store-stub.mjs) and Resend is a fake fetch
// that records what would have been sent. That is the point — every assertion
// below is about the message and the decisions, not about a provider.

import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";

process.env.UNSUBSCRIBE_SECRET = "test-unsubscribe-secret-not-a-real-credential";
process.env.RESEND_API_KEY = "re_test_not_a_real_key";
process.env.NEXT_PUBLIC_SITE_URL = "https://wynnessentialsllc.us";

const store = await import("./subscribers-store-stub.mjs");
const { POST: subscribe } = await import("../app/api/subscribe/route.ts");
const { POST: unsubscribe } = await import("../app/api/unsubscribe/route.ts");
const { wynnEditWelcomeEmail } = await import("../lib/wynn-edit-email.ts");
const { unsubscribeUrl } = await import("../lib/unsubscribe.ts");

const SITE = "https://wynnessentialsllc.us";

// --- fake Resend -------------------------------------------------------------
const realFetch = globalThis.fetch;
let sent = [];
let providerBehaviour = "accept"; // "accept" | "reject" | "throw"

function installFakeResend() {
  sent = [];
  providerBehaviour = "accept";
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes("api.resend.com")) throw new Error(`unexpected network call to ${url}`);
    const payload = JSON.parse(init.body);
    if (providerBehaviour === "throw") throw new Error("socket hang up");
    if (providerBehaviour === "reject") return new Response("rate limited", { status: 429 });
    sent.push(payload);
    return new Response(JSON.stringify({ id: `test-${sent.length}` }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

// The route rate-limits per client IP, and that limiter lives for the life of
// the module. Each test therefore submits from its own address, so one test's
// traffic can never throttle the next — while a single test can still submit
// twice from one address to exercise the double-click case.
let clientIp = "203.0.113.1";
let ipCounter = 0;

const post = (body, headers = {}) =>
  subscribe(new Request(`${SITE}/api/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE, "x-forwarded-for": clientIp, ...headers },
    body: JSON.stringify(body),
  }));

const join = (email, extra = {}) => post({ email, consent: true, source: "the-wynn-edit", ...extra });

const welcomes = () => sent.filter(m => m.subject.includes("The Wynn Edit list"));

beforeEach(() => { store.reset(); installFakeResend(); clientIp = `203.0.113.${++ipCounter}`; });
afterEach(() => { globalThis.fetch = realFetch; });

// --- signup decisions --------------------------------------------------------

test("a valid new subscriber is stored with a full consent record and welcomed once", async () => {
  const before = Date.now();
  const res = await join("New.Subscriber@Example.COM");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, status: "subscribed" });

  // Normalised on the way in, so casing can never create a second row.
  const row = store.store.get("new.subscriber@example.com");
  assert.ok(row, "the subscriber is stored under the normalised address");
  assert.equal(row.marketingConsent, true);
  assert.match(row.consentText, /you agree to receive Wynn Essentials marketing emails/i);
  assert.equal(row.consentVersion, "2026-08");
  assert.equal(row.formId, "the-wynn-edit-newsletter-section");
  assert.equal(row.source, "the-wynn-edit");
  assert.ok(row.consentAt instanceof Date && row.consentAt.getTime() >= before, "consent is timestamped");
  assert.ok(row.welcomeSentAt instanceof Date, "the welcome is claimed");
  assert.equal(row.unsubscribedAt, null);

  assert.equal(welcomes().length, 1);
});

test("no consent means no subscription and no email", async () => {
  const res = await post({ email: "no-consent@example.com", consent: false, source: "the-wynn-edit" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /agree to receive marketing emails/i);
  assert.equal(store.store.size, 0);
  assert.equal(sent.length, 0);
});

test("an invalid email is rejected before anything is stored or sent", async () => {
  for (const bad of ["", "   ", "not-an-email", "two@@example.com", "spaced out@example.com", "trailing@example", "a@b.c,d@e.fg", `${"x".repeat(250)}@example.com`]) {
    const res = await post({ email: bad, consent: true, source: "the-wynn-edit" });
    assert.equal(res.status, 400, `expected ${JSON.stringify(bad)} to be rejected`);
  }
  assert.equal(store.store.size, 0);
  assert.equal(sent.length, 0);
});

test("an already-active subscriber gets no second welcome and a non-enumerating answer", async () => {
  await join("repeat@example.com");
  assert.equal(welcomes().length, 1);

  const second = await join("repeat@example.com");
  assert.deepEqual(await second.json(), { ok: true, status: "eligible" });
  assert.equal(welcomes().length, 1, "still exactly one welcome");

  // The re-submission refreshes what she was shown, but the consent behind the
  // live subscription keeps its original timestamp.
  const row = store.store.get("repeat@example.com");
  assert.ok(row.consentAt instanceof Date);
  assert.ok(row.updatedAt instanceof Date);
});

test("a form double-click produces one subscription and one welcome", async () => {
  const [a, b] = await Promise.all([join("fast-fingers@example.com"), join("fast-fingers@example.com")]);
  const statuses = [(await a.json()).status, (await b.json()).status].sort();
  assert.deepEqual(statuses, ["eligible", "subscribed"]);
  assert.equal(welcomes().length, 1);
  assert.equal(store.store.size, 1);
});

test("a previously unsubscribed address is never silently resubscribed", async () => {
  await join("gone@example.com");
  assert.equal(welcomes().length, 1);

  // She unsubscribes through the signed link in the email footer.
  const optOut = new URL(unsubscribeUrl("gone@example.com"));
  const res = await unsubscribe(new Request(optOut.href, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ e: "gone@example.com", t: optOut.searchParams.get("t") }),
  }));
  assert.equal(res.status, 303);
  assert.equal(store.store.get("gone@example.com").marketingConsent, false);
  assert.ok(store.store.get("gone@example.com").unsubscribedAt instanceof Date);

  // A signup attempt WITHOUT ticking the box cannot bring her back.
  const noConsent = await post({ email: "gone@example.com", consent: false, source: "the-wynn-edit" });
  assert.equal(noConsent.status, 400);
  assert.equal(store.store.get("gone@example.com").marketingConsent, false);
  assert.equal(welcomes().length, 1, "no email to a suppressed address");
});

test("a legitimate resubscription with fresh consent is welcomed back exactly once", async () => {
  await join("returning@example.com");
  const optOut = new URL(unsubscribeUrl("returning@example.com"));
  await unsubscribe(new Request(optOut.href, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ e: "returning@example.com", t: optOut.searchParams.get("t") }),
  }));
  assert.equal(welcomes().length, 1);

  const back = await join("returning@example.com");
  assert.deepEqual(await back.json(), { ok: true, status: "subscribed" });
  const row = store.store.get("returning@example.com");
  assert.equal(row.marketingConsent, true);
  assert.equal(row.unsubscribedAt, null, "the suppression is lifted only by fresh affirmative consent");
  assert.equal(welcomes().length, 2, "a genuine return is welcomed again");

  // ...and re-submitting after that does not welcome her a third time.
  await join("returning@example.com");
  assert.equal(welcomes().length, 2);
});

test("a waitlist signup records no marketing consent and never joins the marketing list", async () => {
  const res = await post({ email: "waiting@example.com", consent: false, source: "waitlist:boho-spanish-curl-18" });
  assert.equal(res.status, 200);
  const row = store.store.get("waiting@example.com");
  assert.equal(row.marketingConsent, false);
  assert.match(row.consentText, /No marketing list/i);
  assert.equal(welcomes().length, 0, "a restock alert is not The Wynn Edit");
});

// --- provider and database failure -------------------------------------------

test("a provider rejection subscribes her but never claims an email was sent, and stays retryable", async () => {
  providerBehaviour = "reject";
  const res = await join("provider-down@example.com");
  assert.deepEqual(await res.json(), { ok: true, status: "recorded" });

  const row = store.store.get("provider-down@example.com");
  assert.equal(row.marketingConsent, true, "her consent is still on file");
  assert.equal(row.welcomeSentAt, null, "a definite non-send releases the claim so it can be retried");

  // A later attempt, once the provider recovers, delivers exactly one welcome.
  providerBehaviour = "accept";
  const retry = await join("provider-down@example.com");
  assert.deepEqual(await retry.json(), { ok: true, status: "subscribed" });
  assert.equal(welcomes().length, 1);
});

test("an ambiguous provider failure keeps the claim, so a retry cannot duplicate a delivered email", async () => {
  providerBehaviour = "throw";
  const res = await join("timeout@example.com");
  assert.deepEqual(await res.json(), { ok: true, status: "recorded" });
  assert.ok(store.store.get("timeout@example.com").welcomeSentAt instanceof Date, "the claim is held when delivery is unknown");

  providerBehaviour = "accept";
  const retry = await join("timeout@example.com");
  assert.deepEqual(await retry.json(), { ok: true, status: "eligible" });
  assert.equal(welcomes().length, 0, "no second copy is risked");
});

test("a database failure is reported as unavailable without leaking configuration", async () => {
  store.failOnce("connection terminated unexpectedly");
  const res = await join("db-down@example.com");
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.match(body.error, /unavailable right now/i);
  assert.doesNotMatch(JSON.stringify(body), /connection terminated|postgres|DATABASE_URL/i);
  assert.equal(sent.length, 0);
});

test("a replayed request body cannot produce a second welcome", async () => {
  const body = { email: "replay@example.com", consent: true, source: "the-wynn-edit" };
  await post(body);
  await post(body);
  await post(body);
  assert.equal(welcomes().length, 1);
});

// --- the email itself --------------------------------------------------------

const built = () => wynnEditWelcomeEmail({ email: "reader@example.com" });

test("the welcome carries the approved subject, preview text and copy as live text", async () => {
  const { subject, preheader, html, text } = built();
  assert.equal(subject, "You’re officially on The Wynn Edit list");
  assert.equal(preheader, "Good hair information is coming to your inbox.");
  assert.match(html, /Good hair information is coming to your inbox\./);

  for (const copy of [
    "THE WYNN EDIT",
    "You’re on the list.",
    "Welcome to The Wynn Edit, where good hair information meets intentional care.",
    "You’ll receive routine guidance, ingredient education, product releases, early access, and thoughtful information created to help you care for your hair with more clarity and less guesswork.",
    "Here’s what belongs in your inbox.",
    "ROUTINE GUIDANCE",
    "Simple ways to build a hair-care practice you can actually maintain.",
    "INGREDIENT EDUCATION",
    "Clear explanations of what ingredients do and how they may fit your routine.",
    "PRODUCT RELEASES",
    "First looks at new Wynn Essentials products, collections, and restocks.",
    "EARLY ACCESS",
    "Subscriber-first access to select launches and special announcements.",
    "Healthy hair is not one perfect wash day. It is a practice built through cleansing, conditioning, treating, moisturizing, sealing, and styling with intention.",
    "Good hair information starts here.",
    "We’re glad you’re here.",
    "The Wynn Essentials Team",
    "Healthy hair is a practice.",
  ]) {
    assert.ok(html.toUpperCase().includes(copy.toUpperCase()), `HTML is missing approved copy: ${copy}`);
    assert.ok(text.toUpperCase().includes(copy.toUpperCase()), `plain text is missing approved copy: ${copy}`);
  }

  // Both calls to action are present, in both parts, with their approved labels.
  assert.match(html, /Explore The Wynn Method/i);
  assert.match(html, /Shop the Essentials/i);
  assert.match(text, /Explore The Wynn Method: https:/i);
  assert.match(text, /Shop the Essentials: https:/i);
});

test("the welcome offers no discount and invents no promo code", () => {
  const { html, text } = built();
  for (const body of [html, text]) {
    assert.doesNotMatch(body, /\b\d{1,2}%\s*off\b/i);
    assert.doesNotMatch(body, /promo|coupon|discount code|WELCOME\d+/i);
  }
});

test("every link and image is an absolute production URL — no localhost, no preview host", () => {
  const { html } = built();
  const urls = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]).filter(u => !u.startsWith("mailto:"));
  assert.ok(urls.length > 0);
  for (const url of urls) {
    assert.match(url, /^https:\/\/wynnessentialsllc\.us(\/|$|#)/, `not a production URL: ${url}`);
    assert.doesNotMatch(url, /localhost|127\.0\.0\.1|vercel\.app|\?(X-Amz|token|signature)/i);
  }
  // The Wynn Method CTA lands on the live Wynn Method section.
  assert.ok(urls.includes("https://wynnessentialsllc.us/#the-wynn-method"));
  assert.ok(urls.includes("https://wynnessentialsllc.us/#shop"));
});

test("a developer NEXT_PUBLIC_SITE_URL can never leak a localhost asset into a sent email", async () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    for (const value of ["http://localhost:3000", "https://localhost:3000", "", "not a url"]) {
      process.env.NEXT_PUBLIC_SITE_URL = value;
      const { emailOrigin } = await import(`../lib/wynn-edit-email.ts?origin=${encodeURIComponent(value)}`);
      assert.equal(emailOrigin(), "https://wynnessentialsllc.us", `origin fell back wrongly for ${JSON.stringify(value)}`);
    }
  } finally {
    process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});

test("every image has descriptive alt text and the email reads without images", () => {
  const { html } = built();
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
  assert.ok(imgs.length >= 3, "the editorial layout uses the brand photography");
  for (const img of imgs) {
    const alt = /alt="([^"]*)"/.exec(img);
    assert.ok(alt, `image without an alt attribute: ${img.slice(0, 80)}`);
    assert.ok(alt[1].trim().length >= 12, `alt text is too thin to be useful: ${alt[1]}`);
  }
  // Nothing that matters is trapped in an image: strip every tag and the
  // headline, the benefits, the CTA labels and the legal lines are all still
  // there as words.
  const visible = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const copy of ["You’re on the list.", "ROUTINE GUIDANCE", "EARLY ACCESS", "Explore The Wynn Method", "Unsubscribe", "Los Angeles, CA 90010"]) {
    assert.ok(visible.includes(copy), `not available as live text: ${copy}`);
  }
});

test("the footer carries the mailing address, a working unsubscribe link, and a repliable sender", () => {
  const { html, text } = built();
  const expectedOptOut = unsubscribeUrl("reader@example.com");
  assert.ok(expectedOptOut.startsWith("https://wynnessentialsllc.us/unsubscribe?e="));
  assert.ok(html.includes(expectedOptOut.replace(/&/g, "&amp;")), "the visible unsubscribe link is the signed one");
  assert.ok(text.includes(expectedOptOut));

  for (const body of [html, text]) {
    assert.match(body, /Wynn Essentials, LLC · 3680 Wilshire Blvd\., Ste P04 A118, Los Angeles, CA 90010/);
    assert.match(body, /wynnessentialsllc@gmail\.com/);
    assert.doesNotMatch(body, /no-?reply/i);
  }
});

test("the send is marketing-shaped: one-click unsubscribe, plain text, repliable From", async () => {
  await join("headers@example.com");
  const [message] = welcomes();
  assert.ok(message, "a welcome was sent");
  assert.equal(message.reply_to, "wynnessentialsllc@gmail.com");
  assert.ok(message.text && message.text.length > 500, "a plain-text alternative is included");
  assert.match(message.headers["List-Unsubscribe"], /^<https:\/\/wynnessentialsllc\.us\/unsubscribe\?e=/);
  assert.match(message.headers["List-Unsubscribe"], /mailto:wynnessentialsllc@gmail\.com/);
  assert.equal(message.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("a one-click unsubscribe POST from a mailbox provider is honoured with a plain 200", async () => {
  await join("oneclick@example.com");
  const optOut = unsubscribeUrl("oneclick@example.com");
  const res = await unsubscribe(new Request(optOut, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ "List-Unsubscribe": "One-Click" }),
  }));
  assert.equal(res.status, 200, "a redirect would be read as a failure by the provider");
  assert.equal(store.store.get("oneclick@example.com").marketingConsent, false);
  assert.ok(store.store.get("oneclick@example.com").unsubscribedAt instanceof Date);
});

test("a forged unsubscribe token changes nothing", async () => {
  await join("safe@example.com");
  const res = await unsubscribe(new Request(`${SITE}/api/unsubscribe?e=safe%40example.com&t=${"0".repeat(32)}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ "List-Unsubscribe": "One-Click" }),
  }));
  assert.equal(res.status, 400);
  assert.equal(store.store.get("safe@example.com").marketingConsent, true);
});

test("an address that would break out of the HTML is escaped everywhere it appears", () => {
  const hostile = `"><script>alert('x')</script>@example.com`;
  const { html } = wynnEditWelcomeEmail({ email: hostile });
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /alert\('x'\)/);
  // The address only ever reaches the markup through the URL-encoded, escaped
  // unsubscribe link.
  assert.match(html, /\/unsubscribe\?e=%22%3E%3Cscript%3E/);
});

test("the email is small enough that Gmail will not clip it", () => {
  const { html } = built();
  assert.ok(Buffer.byteLength(html, "utf8") < 102_000, "Gmail clips messages over ~102KB");
});

// --- the storefront form's success and error states --------------------------

test("the signup form replaces itself with a branded confirmation and never over-claims", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/WynnShop.tsx", import.meta.url), "utf8");

  // One confirmation per status the API is willing to return.
  assert.match(source, /subscribed: \{ heading: "You’re on the list\.", body: "Good hair information is officially headed to your inbox\." \}/);
  assert.match(source, /eligible: \{ heading: "[^"]+", body: "If this email is eligible, you’ll receive the next edition\." \}/);
  // The "recorded" state confirms the subscription without asserting a send.
  const recorded = /recorded: \{ heading: "([^"]+)", body: "([^"]+)" \}/.exec(source);
  assert.ok(recorded, "a confirmation exists for a stored-but-not-emailed signup");
  assert.doesNotMatch(recorded[2], /sent|on its way|check your inbox|headed to your inbox/i);

  // A second click while the first request is in flight must not fire again.
  assert.match(source, /if\(state==="sending"\) return;/);
  assert.match(source, /disabled=\{state==="sending"\}/);
  // Consent still travels with the request and is still checked before sending.
  assert.match(source, /body:JSON\.stringify\(\{email,consent:agreed,source:"the-wynn-edit"\}\)/);
});

test("the layout is email-safe: table-based, 600px, inline styles, no external CSS or scripts", () => {
  const { html } = built();
  assert.match(html, /<table role="presentation"/);
  assert.match(html, /width="600"[^>]*style="width:600px;max-width:600px/);
  assert.doesNotMatch(html, /<link\b|<script\b/i);
  assert.doesNotMatch(html, /class="(?!wrap|pad|stack|gutter|gap|h1|h2|btn|feature-img)/);
  // The <style> block is stacking only; the design must not depend on it.
  assert.match(html, /@media only screen and \(max-width:620px\)/);
});
