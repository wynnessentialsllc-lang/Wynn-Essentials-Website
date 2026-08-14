// Who each email says it is from.
//
// Two things are being protected here. The first is that every customer message
// carries its own display name, so an inbox can tell a receipt from a marketing
// welcome without opening either. The second is that only the NAME is ever
// per-message: the address stays exactly as NOTIFY_FROM configures it, because a
// local part nobody verified in Resend would bounce every send.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { SENDER, fromHeader } = await import("../lib/email-sender.ts");

const withFrom = (value, run) => {
  const previous = process.env.NOTIFY_FROM;
  if (value === undefined) delete process.env.NOTIFY_FROM; else process.env.NOTIFY_FROM = value;
  try { return run(); } finally {
    if (previous === undefined) delete process.env.NOTIFY_FROM; else process.env.NOTIFY_FROM = previous;
  }
};

// --- the address is never invented ------------------------------------------

test("the configured address is kept, whichever shape it is written in", () => {
  for (const configured of [
    "Wynn Essentials <notifications@wynnessentialsllc.us>",
    "notifications@wynnessentialsllc.us",
    "  notifications@wynnessentialsllc.us  ",
  ]) {
    withFrom(configured, () => {
      assert.equal(fromHeader(SENDER.confirmation), "Wynn Essentials Confirmation <notifications@wynnessentialsllc.us>");
    });
  }
});

test("no name means exactly what was configured, unchanged", () => {
  withFrom("Wynn Essentials <notifications@wynnessentialsllc.us>", () => {
    assert.equal(fromHeader(), "Wynn Essentials <notifications@wynnessentialsllc.us>");
    assert.equal(fromHeader(""), "Wynn Essentials <notifications@wynnessentialsllc.us>");
  });
});

test("an unconfigured environment still sends from the Resend sandbox address", () => {
  withFrom(undefined, () => {
    assert.equal(fromHeader(SENDER.shipping), "Wynn Essentials Shipping <onboarding@resend.dev>");
  });
});

test("a NOTIFY_FROM nobody can parse degrades to itself rather than to an invented header", () => {
  for (const broken of ["not-an-address", "<>", "Wynn Essentials <>", ""]) {
    withFrom(broken, () => {
      const header = fromHeader(SENDER.review);
      assert.ok(
        header === broken.trim() || header.endsWith("<onboarding@resend.dev>"),
        `a broken NOTIFY_FROM (${JSON.stringify(broken)}) produced ${JSON.stringify(header)}`,
      );
      assert.doesNotMatch(header, /Wynn Essentials Review <(?!onboarding@resend\.dev)/);
    });
  }
});

test("a display name cannot break the header or forge a second one", () => {
  withFrom("notifications@wynnessentialsllc.us", () => {
    const header = fromHeader('Evil"\r\nBcc: victim@example.com <attacker@example.com>');
    assert.doesNotMatch(header, /[\r\n]/, "a newline survived into the From header");
    assert.doesNotMatch(header, /Bcc:/i, "a header could be forged through the display name");
    // Exactly one address, and it is the configured one.
    assert.equal(header.match(/</g)?.length, 1);
    assert.ok(header.endsWith("<notifications@wynnessentialsllc.us>"));
  });
});

// --- every message says which one it is --------------------------------------

test("the names are distinct, short enough for a phone, and all one brand", () => {
  const names = Object.values(SENDER);
  assert.equal(new Set(names).size, names.length, "two kinds of email share a sender name");
  for (const name of names) {
    assert.match(name, /^Wynn Essentials /, `${name} does not read as Wynn Essentials`);
    // A phone truncates a sender around 25–30 characters, and the end is what
    // gets cut — which is the part carrying the meaning.
    assert.ok(name.length <= 28, `"${name}" is ${name.length} chars and will truncate on a phone`);
    assert.doesNotMatch(name, /[\r\n"<>,;:]/, `${name} contains a character that has no business in a header`);
  }
});

test("every customer email is sent under a name, and the right one", async () => {
  const notify = await readFile(new URL("../lib/notify.ts", import.meta.url), "utf8");
  const sendsIn = (fn, next) => {
    const start = notify.indexOf(fn);
    assert.ok(start > -1, `${fn} is gone`);
    return notify.slice(start, next ? notify.indexOf(next) : undefined);
  };

  const expected = [
    ["export async function notifyCustomerOrderConfirmation", "export async function notifySubscriberWelcome", "SENDER.confirmation"],
    ["export async function notifyCustomerShipped", "// Post-purchase review request", "SENDER.shipping"],
    ["export async function notifyProductEducation", "// Post-purchase review request", "SENDER.care"],
    ["export async function notifyReviewRequest", null, "SENDER.review"],
    ["export async function notifyFirstOrderWelcome", "/**\n * The Wynn Edit welcome", "SENDER.welcome"],
    ["export async function notifyWynnEditWelcome", "/** Abandoned-cart reminder", "SENDER.welcome"],
    ["export async function notifyAbandonedCart", "/** \"Back in stock\"", "SENDER.bag"],
    ["export async function notifyCustomerRestock", "type ShippedInfo", "SENDER.restock"],
  ];

  for (const [fn, next, sender] of expected) {
    const body = sendsIn(fn, next);
    assert.ok(body.includes(`fromName: ${sender}`), `${fn} does not send as ${sender}`);
  }

  // And the owner's own alerts are labelled as alerts, never as a customer name.
  assert.match(notify, /sendOwnerEmail[\s\S]{0,200}fromName: SENDER\.alerts/);
});

test("no send path was left on the old single name", async () => {
  const notify = await readFile(new URL("../lib/notify.ts", import.meta.url), "utf8");
  // Every call that reaches Resend goes through deliverEmail/sendEmail with a
  // recipient. Counting them against the number of fromName arguments catches a
  // new email added later without one.
  const sends = notify.match(/return (?:send|deliver)Email\(\{|return sendEmail\(\{/g)?.length ?? 0;
  const named = notify.match(/fromName: SENDER\./g)?.length ?? 0;
  assert.ok(named >= sends, `${sends} send sites but only ${named} sender names — one email would go out unlabelled`);
  // The old behaviour read the environment directly at the send site.
  assert.doesNotMatch(notify, /const from = process\.env\.NOTIFY_FROM/);
});
