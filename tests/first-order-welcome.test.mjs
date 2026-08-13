// The WELCOME15 popup signup and its welcome email, end to end through the real
// route handler and the real renderer.
//
// Nothing here reaches the network, Stripe, or a database: the subscribers table
// is the in-memory stub (tests/subscribers-store-stub.mjs) and Resend is a fake
// fetch that records what would have been sent.
//
// The promotion is deliberately NOT consulted live. This suite asserts what the
// application does with an offer it is handed, and that it advertises nothing
// when there is no live offer to advertise — the real Stripe terms are verified
// by `npm run stripe:check`, not from here.

import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";

process.env.UNSUBSCRIBE_SECRET = "test-unsubscribe-secret-not-a-real-credential";
process.env.RESEND_API_KEY = "re_test_not_a_real_key";
process.env.NEXT_PUBLIC_SITE_URL = "https://wynnessentialsllc.us";
// The popup only advertises the code while the promo field exists at checkout.
process.env.STRIPE_PROMOTION_CODES_ENABLED = "true";

const store = await import("./subscribers-store-stub.mjs");
const { POST: subscribe } = await import("../app/api/subscribe/route.ts");
const { POST: unsubscribe } = await import("../app/api/unsubscribe/route.ts");
const { firstOrderWelcomeEmail } = await import("../lib/first-order-welcome-email.ts");
const { firstOrderFixtures, firstOrderFixtureByKey } = await import("../lib/first-order-welcome-fixtures.ts");
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
    if (providerBehaviour === "throw") throw new Error("socket hang up");
    if (providerBehaviour === "reject") return new Response("rate limited", { status: 429 });
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: `test-${sent.length}` }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

let clientIp = "203.0.113.1";
let ipCounter = 0;

const post = (body, headers = {}) =>
  subscribe(new Request(`${SITE}/api/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE, "x-forwarded-for": clientIp, ...headers },
    body: JSON.stringify(body),
  }));

/** A submission from the WELCOME15 popup. */
const claimOffer = (email, extra = {}) => post({ email, consent: true, source: "first-order-popup", ...extra });
/** A submission from The Wynn Edit newsletter section. */
const joinEdit = (email) => post({ email, consent: true, source: "the-wynn-edit" });

const offerEmails = () => sent.filter(m => m.subject === "A little something for your first Wynn Essentials order");
const editEmails = () => sent.filter(m => m.subject.includes("The Wynn Edit list"));
const welcomes = () => [...offerEmails(), ...editEmails()];

async function surfaceOf(response) {
  return { status: response.status, headers: [...response.headers].filter(([k]) => k !== "date").sort(), body: await response.text() };
}

async function unsubscribeVia(email) {
  const url = new URL(unsubscribeUrl(email));
  return unsubscribe(new Request(url.href, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ e: email, t: url.searchParams.get("t") }),
  }));
}

beforeEach(() => {
  store.reset();
  installFakeResend();
  clientIp = `203.0.113.${++ipCounter}`;
  process.env.STRIPE_PROMOTION_CODES_ENABLED = "true";
});
afterEach(() => { globalThis.fetch = realFetch; });

// --- signup decisions --------------------------------------------------------

test("a new popup subscriber is stored with full consent and sent the offer welcome once", async () => {
  const before = Date.now();
  const res = await claimOffer("First.Order@Example.COM");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, status: "received" });

  const row = store.store.get("first.order@example.com");
  assert.ok(row, "stored under the normalised address");
  assert.equal(row.marketingConsent, true);
  assert.match(row.consentText, /you agree to receive Wynn Essentials marketing emails/i);
  assert.equal(row.consentVersion, "2026-08");
  // The popup is recorded as its own placement, distinct from the newsletter.
  assert.equal(row.formId, "first-order-welcome-popup");
  assert.equal(row.source, "first-order-popup");
  assert.ok(row.consentAt instanceof Date && row.consentAt.getTime() >= before);
  assert.ok(row.welcomeSentAt instanceof Date);
  assert.equal(row.unsubscribedAt, null);

  assert.equal(offerEmails().length, 1);
  assert.equal(editEmails().length, 0, "she gets the offer welcome, not both");
});

test("an unchecked consent box stores nothing and sends nothing", async () => {
  const res = await post({ email: "no-consent@example.com", consent: false, source: "first-order-popup" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /agree to receive marketing emails/i);
  assert.equal(store.store.size, 0);
  assert.equal(sent.length, 0);
});

test("an existing active subscriber gets no second welcome", async () => {
  await claimOffer("already@example.com");
  assert.equal(offerEmails().length, 1);

  const again = await claimOffer("already@example.com");
  assert.deepEqual(await again.json(), { ok: true, status: "received" });
  assert.equal(welcomes().length, 1, "still exactly one welcome in total");
});

test("a suppressed address is never silently resubscribed by the popup", async () => {
  await claimOffer("left@example.com");
  await unsubscribeVia("left@example.com");
  assert.equal(store.store.get("left@example.com").marketingConsent, false);

  // No checkbox: nothing may bring her back.
  const refused = await post({ email: "left@example.com", consent: false, source: "first-order-popup" });
  assert.equal(refused.status, 400);
  assert.equal(store.store.get("left@example.com").marketingConsent, false);
  assert.ok(store.store.get("left@example.com").unsubscribedAt instanceof Date);
  assert.equal(welcomes().length, 1);
});

test("a legitimate affirmative resubscription through the popup is welcomed back once", async () => {
  await claimOffer("comeback@example.com");
  await unsubscribeVia("comeback@example.com");
  assert.equal(offerEmails().length, 1);

  const back = await claimOffer("comeback@example.com");
  assert.deepEqual(await back.json(), { ok: true, status: "received" });
  const row = store.store.get("comeback@example.com");
  assert.equal(row.marketingConsent, true);
  assert.equal(row.unsubscribedAt, null, "suppression lifted only by fresh affirmative consent");
  assert.equal(offerEmails().length, 2);

  // ...and not a third time on the next submission.
  await claimOffer("comeback@example.com");
  assert.equal(offerEmails().length, 2);
});

test("a duplicate submission and a double-click each produce one welcome", async () => {
  const body = { email: "twice@example.com", consent: true, source: "first-order-popup" };
  await post(body);
  await post(body);
  assert.equal(offerEmails().length, 1);

  const [a, b] = await Promise.all([claimOffer("clicky@example.com"), claimOffer("clicky@example.com")]);
  assert.deepEqual(await a.json(), { ok: true, status: "received" });
  assert.deepEqual(await b.json(), { ok: true, status: "received" });
  assert.equal(offerEmails().length, 2, "one for twice@, one for clicky@ — never two for either");
});

// --- the cross-flow audit ----------------------------------------------------

test("submitting BOTH the newsletter form and the popup sends exactly one welcome", async () => {
  // Newsletter first, then the popup.
  await joinEdit("both-ways@example.com");
  await claimOffer("both-ways@example.com");
  assert.equal(editEmails().length, 1);
  assert.equal(offerEmails().length, 0, "the popup must not add a second, near-identical welcome");

  // ...and the other way round.
  await claimOffer("other-order@example.com");
  await joinEdit("other-order@example.com");
  assert.equal(offerEmails().length, 1);
  assert.equal(editEmails().length, 1, "one Wynn Edit welcome, for the address that earned it");

  // Two subscribers, two welcomes total — not four.
  assert.equal(welcomes().length, 2);
});

test("the popup still hands over the offer when a welcome was already sent", async () => {
  // She joined the newsletter yesterday, so the welcome claim is spent. Today
  // she opens the popup: the API accepts her, sends nothing, and the popup's
  // own success state is what carries the code — assert the response the popup
  // relies on is a plain success.
  await joinEdit("has-welcome@example.com");
  sent = [];
  const res = await claimOffer("has-welcome@example.com");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, status: "received" });
  assert.equal(sent.length, 0, "no duplicate marketing welcome");

  // The popup renders the code from configuration on any successful response,
  // so the offer still reaches her without a second email.
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/WynnShop.tsx", import.meta.url), "utf8");
  assert.match(source, /state === "done" \? <div className="offer-done">/);
  assert.match(source, /className="offer-code">\{brandConfig\.firstOrder\.code\}/);
});

// --- promotion state ---------------------------------------------------------

test("with the promo field switched off at checkout, no code is advertised", async () => {
  process.env.STRIPE_PROMOTION_CODES_ENABLED = "false";
  const res = await claimOffer("no-promo@example.com");
  assert.deepEqual(await res.json(), { ok: true, status: "received" });

  assert.equal(offerEmails().length, 0, "never promise a code checkout would refuse");
  assert.equal(editEmails().length, 1, "she still gets a welcome, just without an offer");
  // Nothing that went out mentions the code — including the owner alert, which
  // carries no plain-text part at all.
  for (const message of sent) {
    assert.doesNotMatch(message.html ?? "", /WELCOME15/);
    assert.doesNotMatch(message.text ?? "", /WELCOME15/);
  }
  // Her consent is still recorded in full.
  assert.equal(store.store.get("no-promo@example.com").marketingConsent, true);
});

test("the offer resolver is the single gate on advertising a code", async () => {
  const { firstOrderOffer } = await import(`../lib/first-order-offer.ts?case=gate`);
  process.env.STRIPE_PROMOTION_CODES_ENABLED = "true";
  const live = firstOrderOffer();
  assert.ok(live, "an offer exists while the promo field is on");
  assert.equal(live.code, "WELCOME15");
  assert.equal(live.label, "15% off");
  assert.deepEqual([...live.verifiedTerms], [], "no terms are claimed until a human confirms them against Stripe");

  process.env.STRIPE_PROMOTION_CODES_ENABLED = "false";
  assert.equal(firstOrderOffer(), null);
});

test("a previously redeemed offer is not something this endpoint reveals or re-decides", async () => {
  // Redemption lives in Stripe; the application never reads it, so a returning
  // shopper is treated exactly like anyone else and learns nothing extra. What
  // must hold is that a second submission neither errors nor emails again.
  await claimOffer("redeemed@example.com");
  sent = [];
  const again = await surfaceOf(await claimOffer("redeemed@example.com"));
  const stranger = await surfaceOf(await claimOffer("never-shopped@example.com"));
  assert.equal(again.status, 200);
  assert.equal(again.body, JSON.stringify({ ok: true, status: "received" }));
  assert.deepEqual(again, stranger, "a repeat claimant is indistinguishable from a first-timer");
  assert.equal(offerEmails().length, 1, "only the genuinely new address was welcomed");
});

// --- provider failure --------------------------------------------------------

test("a provider rejection records consent, claims nothing, and stays retryable", async () => {
  providerBehaviour = "reject";
  const res = await claimOffer("provider-down@example.com");
  assert.deepEqual(await res.json(), { ok: true, status: "received" });

  const row = store.store.get("provider-down@example.com");
  assert.equal(row.marketingConsent, true);
  assert.equal(row.welcomeSentAt, null, "a definite non-send releases the claim");

  providerBehaviour = "accept";
  await claimOffer("provider-down@example.com");
  assert.equal(offerEmails().length, 1, "the retry delivers exactly one");
});

test("an ambiguous timeout keeps the claim, so a retry cannot duplicate a delivered email", async () => {
  providerBehaviour = "throw";
  await claimOffer("timeout@example.com");
  assert.ok(store.store.get("timeout@example.com").welcomeSentAt instanceof Date);

  providerBehaviour = "accept";
  await claimOffer("timeout@example.com");
  assert.equal(offerEmails().length, 0, "no second copy is risked");
});

test("a database failure is reported as unavailable without leaking configuration", async () => {
  store.failOnce("connection terminated unexpectedly");
  const res = await claimOffer("db-down@example.com");
  assert.equal(res.status, 503);
  const body = await res.text();
  assert.match(body, /unavailable right now/i);
  assert.doesNotMatch(body, /connection terminated|postgres|DATABASE_URL/i);
  assert.equal(sent.length, 0);
});

// --- the public response reveals nothing -------------------------------------

test("every successful popup submission answers identically, whatever the address's status", async () => {
  const brandNew = "probe-new@example.com";

  const active = "probe-active@example.com";
  await claimOffer(active);

  const suppressed = "probe-suppressed@example.com";
  await claimOffer(suppressed);
  await unsubscribeVia(suppressed);

  const viaNewsletter = "probe-newsletter@example.com";
  await joinEdit(viaNewsletter);

  const probes = [brandNew, active, suppressed, viaNewsletter];
  const before = probes.map(a => {
    const row = store.store.get(a);
    return { exists: !!row, consent: row?.marketingConsent ?? null, suppressed: !!row?.unsubscribedAt, welcomed: !!row?.welcomeSentAt };
  });
  assert.deepEqual(before, [
    { exists: false, consent: null, suppressed: false, welcomed: false },
    { exists: true, consent: true, suppressed: false, welcomed: true },
    { exists: true, consent: false, suppressed: true, welcomed: true },
    { exists: true, consent: true, suppressed: false, welcomed: true },
  ], "the four probes really are in four different internal states");

  const surfaces = [];
  for (const address of probes) {
    clientIp = `198.51.100.${surfaces.length + 1}`;
    surfaces.push({ address, surface: await surfaceOf(await claimOffer(address)) });
  }
  const [first, ...rest] = surfaces;
  assert.equal(first.surface.status, 200);
  assert.equal(first.surface.body, JSON.stringify({ ok: true, status: "received" }));
  for (const { address, surface } of rest) {
    assert.deepEqual(surface, first.surface, `response for ${address} differs from a brand-new address`);
  }
  // Suppression really was lifted only by the fresh consent in the probe.
  assert.equal(store.store.get(suppressed).unsubscribedAt, null);
});

// --- the email itself --------------------------------------------------------

const built = (key = "default") => {
  const fixture = firstOrderFixtureByKey(key);
  return firstOrderWelcomeEmail({ email: fixture.email, offer: fixture.offer });
};

test("the welcome carries the approved subject, preview text and copy as live text", () => {
  const { subject, preheader, html, text } = built();
  assert.equal(subject, "A little something for your first Wynn Essentials order");
  assert.equal(preheader, "Welcome in. Your first-order offer is inside.");
  assert.match(html, /Welcome in\. Your first-order offer is inside\./);

  for (const copy of [
    "WELCOME TO WYNN ESSENTIALS",
    "Your practice",
    "starts here.",
    "Thank you for joining us. Use code",
    "WELCOME15",
    "15% OFF",
    "YOUR FIRST ELIGIBLE ORDER",
    "CODE: WELCOME15",
    "SHOP THE ESSENTIALS",
    "Healthy hair is a practice.",
    "Explore intentional essentials for cleansing, conditioning, treating, moisturizing, sealing, and styling textured hair.",
    "Good hair information, thoughtful products, and early access are now headed your way.",
  ]) {
    assert.ok(html.toUpperCase().includes(copy.toUpperCase()), `HTML is missing approved copy: ${copy}`);
  }
  for (const copy of ["WELCOME TO WYNN ESSENTIALS", "YOUR PRACTICE STARTS HERE.", "CODE: WELCOME15", "Healthy hair is a practice."]) {
    assert.ok(text.toUpperCase().includes(copy.toUpperCase()), `plain text is missing approved copy: ${copy}`);
  }
});

test("the email states no offer term that was not verified and recorded", () => {
  const { html, text } = built("default");
  for (const body of [html, text]) {
    // None of these appear unless a human puts them in verifiedTerms.
    assert.doesNotMatch(body, /minimum (purchase|order|spend)/i);
    assert.doesNotMatch(body, /expires?\b/i);
    assert.doesNotMatch(body, /one per customer|single use|limited time|while supplies last/i);
    assert.doesNotMatch(body, /cannot be combined|excludes?\b/i);
  }
  // With terms configured, they are rendered verbatim and nothing is added.
  const withTerms = built("with-verified-terms");
  for (const term of firstOrderFixtureByKey("with-verified-terms").offer.verifiedTerms) {
    assert.ok(withTerms.html.includes(term), `configured term missing from HTML: ${term}`);
    assert.ok(withTerms.text.includes(term), `configured term missing from text: ${term}`);
  }
});

test("the discount shown is the one it was handed, never a hardcoded figure", () => {
  const { html } = firstOrderWelcomeEmail({ email: "x@example.com", offer: { code: "TESTCODE", label: "$25 off", verifiedTerms: [] } });
  assert.match(html, /\$25 OFF/);
  assert.match(html, /CODE: TESTCODE/);
  assert.doesNotMatch(html, /15% ?off/i);
  assert.doesNotMatch(html, /WELCOME15/);
});

test("every link and image is an absolute production URL", () => {
  const { html } = built();
  const urls = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]).filter(u => !u.startsWith("mailto:"));
  assert.ok(urls.length > 0);
  for (const url of urls) {
    assert.match(url, /^https:\/\/wynnessentialsllc\.us(\/|$|#)/, `not a production URL: ${url}`);
    assert.doesNotMatch(url, /localhost|127\.0\.0\.1|\.vercel\.app|blob:|data:|\?(X-Amz|token|signature)/i);
  }
  assert.ok(urls.includes("https://wynnessentialsllc.us/#shop"));
  assert.ok(urls.includes("https://wynnessentialsllc.us/#the-wynn-method"));
  // The shared, email-optimised logo — not the heavy storefront original.
  assert.ok(urls.includes("https://wynnessentialsllc.us/email/wynn-essentials-logo.png"));
});

test("images are email-safe formats with descriptive alt text, and the email reads without them", () => {
  const { html } = built();
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
  assert.ok(imgs.length >= 2);
  for (const img of imgs) {
    const src = /src="([^"]+)"/.exec(img);
    assert.ok(/\.(jpe?g|png|gif)$/i.test(src[1]), `WebP/AVIF break in Outlook: ${src[1]}`);
    const alt = /alt="([^"]*)"/.exec(img);
    assert.ok(alt && alt[1].trim().length >= 12, `alt text too thin: ${img.slice(0, 80)}`);
  }
  // The code, the discount and the legal lines survive images being blocked.
  const visible = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const copy of ["15% OFF", "CODE: WELCOME15", "SHOP THE ESSENTIALS", "Unsubscribe", "Los Angeles, CA 90010"]) {
    assert.ok(visible.includes(copy), `not available as live text: ${copy}`);
  }
});

test("the footer carries the mailing address, a working unsubscribe link, and a repliable sender", () => {
  const { html, text } = built();
  const expected = unsubscribeUrl("preview@example.com");
  assert.ok(expected.startsWith("https://wynnessentialsllc.us/unsubscribe?e="));
  assert.ok(html.includes(expected.replace(/&/g, "&amp;")) || html.includes(expected), "the visible unsubscribe link is the signed one");
  assert.ok(text.includes(expected));
  for (const body of [html, text]) {
    assert.match(body, /Wynn Essentials, LLC · 3680 Wilshire Blvd\., Ste P04 A118, Los Angeles, CA 90010/);
    assert.match(body, /wynnessentialsllc@gmail\.com/);
    assert.doesNotMatch(body, /no-?reply/i);
  }
});

test("the send is marketing-shaped: one-click unsubscribe, plain text, repliable From", async () => {
  await claimOffer("headers@example.com");
  const [message] = offerEmails();
  assert.ok(message);
  assert.equal(message.reply_to, "wynnessentialsllc@gmail.com");
  assert.ok(message.text && message.text.length > 400, "a plain-text alternative is included");
  assert.match(message.headers["List-Unsubscribe"], /^<https:\/\/wynnessentialsllc\.us\/unsubscribe\?e=/);
  assert.match(message.headers["List-Unsubscribe"], /mailto:wynnessentialsllc@gmail\.com/);
  assert.equal(message.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("a one-click unsubscribe POST is honoured with a plain 200, and a forged token is not", async () => {
  await claimOffer("oneclick@example.com");
  const ok = await unsubscribe(new Request(unsubscribeUrl("oneclick@example.com"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ "List-Unsubscribe": "One-Click" }),
  }));
  assert.equal(ok.status, 200, "a redirect would be read as a failure by the provider");
  assert.equal(store.store.get("oneclick@example.com").marketingConsent, false);

  await claimOffer("safe@example.com");
  const forged = await unsubscribe(new Request(`${SITE}/api/unsubscribe?e=safe%40example.com&t=${"0".repeat(32)}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ "List-Unsubscribe": "One-Click" }),
  }));
  assert.equal(forged.status, 400);
  assert.equal(store.store.get("safe@example.com").marketingConsent, true);
});

test("a hostile address or code cannot break out of the markup", () => {
  const { html } = firstOrderWelcomeEmail({
    email: `"><script>alert('x')</script>@example.com`,
    offer: { code: `<img src=x onerror=alert(1)>`, label: `"><b>50% off`, verifiedTerms: [`</td><script>bad()</script>`] },
  });
  // The payloads survive as inert TEXT — "onerror=" and "alert(" appear only
  // inside escaped entities, which is correct. What must never appear is an
  // actual tag: no unescaped "<script", no unescaped "<img", and no attribute
  // able to close out of the one it sits in.
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img[^>]*onerror/i);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/, "the code is rendered escaped");
  assert.match(html, /&lt;\/td&gt;&lt;script&gt;bad\(\)&lt;\/script&gt;/, "the term is rendered escaped");
  assert.match(html, /&quot;&gt;&lt;b&gt;50% OFF/i, "the label is rendered escaped");
  // And the recipient's address only reaches the markup URL-encoded.
  assert.match(html, /\/unsubscribe\?e=%22%3E%3Cscript%3E/);
});

test("the layout is email-safe and small enough that Gmail will not clip it", () => {
  for (const fixture of firstOrderFixtures) {
    const { html } = firstOrderWelcomeEmail({ email: fixture.email, offer: fixture.offer });
    assert.ok(Buffer.byteLength(html, "utf8") < 102_000, `${fixture.key}: Gmail clips messages over ~102KB`);
    assert.match(html, /<table role="presentation"/);
    assert.match(html, /width="600"[^>]*style="width:600px;max-width:600px/);
    assert.doesNotMatch(html, /<link\b|<script\b/i);
    assert.match(html, /@media only screen and \(max-width:620px\)/);
  }
});

test("the popup form requires an unchecked-by-default consent box and blocks double submits", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/WynnShop.tsx", import.meta.url), "utf8");
  const popup = source.slice(source.indexOf("function FirstOrderOffer"), source.indexOf("function NavDropdown"));

  // Unchecked by default, and consent is state the shopper must set.
  assert.match(popup, /const \[consent, setConsent\] = useState\(false\)/);
  assert.match(popup, /type="checkbox" required checked=\{consent\}/);
  assert.match(popup, /if \(!consent\) \{ setState\("err"\); return; \}/);
  // A second click while in flight must not fire again.
  assert.match(popup, /if \(state === "sending"\) return;/);
  assert.match(popup, /disabled=\{state === "sending"\}/);
  // The response is read for success only — never for subscription status.
  assert.match(popup, /as \{ ok\?: boolean \}/);
  assert.doesNotMatch(popup, /result\.status/);
});
