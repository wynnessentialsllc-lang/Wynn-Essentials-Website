// Owner notifications via Resend (https://resend.com). Best-effort by design:
// a missing API key or a failed send is logged but NEVER throws, so it can be
// dropped into the checkout webhook and the review handler without any risk of
// blocking an order or a review submission.
//
// Configuration (all read from the environment, so no secret is ever in code):
//   RESEND_API_KEY  - required to actually send. Without it, sends are skipped.
//   NOTIFY_TO       - where owner alerts go. Defaults to the business inbox.
//   NOTIFY_FROM     - the From ADDRESS. Until the sending domain is verified in
//                     Resend, this must stay "onboarding@resend.dev" and can
//                     only deliver to the Resend account's own email. Once
//                     wynnessentialsllc.us is verified, set this to something
//                     like "Wynn Essentials <notifications@wynnessentialsllc.us>".
//                     Only the address is used: each message supplies its own
//                     display name (lib/email-sender.ts), so a confirmation and
//                     a shipping notice are told apart in the inbox without
//                     needing a second verified address.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_BATCH_ENDPOINT = "https://api.resend.com/emails/batch";
const DEFAULT_TO = "wynnessentialsllc@gmail.com";

// The Resend API key, read from the environment. RESEND_API_KEY is the standard
// name; wynnessentials_site is also accepted so the Vercel variable can be named
// either way. First match wins.
import { listUnsubscribeHeaders, canSignUnsubscribe, unsubscribeUrl } from "./unsubscribe";
import { renderOrderConfirmationEmail, type OrderEmailData } from "./order-confirmation-email";
import { wynnEditWelcomeEmail } from "./wynn-edit-email";
import { firstOrderWelcomeEmail } from "./first-order-welcome-email";
import { productEducationEmail, type EducationEmailInput } from "./product-education-email";
import type { FirstOrderOffer } from "./first-order-offer";
// Carrier tracking links live in their own module so the order-confirmation
// renderer can use them without importing this one. Re-exported below because
// /admin/orders has always imported trackingUrl from lib/notify.
import { trackingUrl } from "./carrier-tracking";
export { trackingUrl };
// Which name each message arrives under. The address never changes — see
// lib/email-sender.ts for why only the display name is per-message.
import { SENDER, fromHeader } from "./email-sender";
export { SENDER };
// The branded shell the shorter customer emails share with the receipt, the
// welcomes, and the education email. Nothing customer-facing renders on the
// plain block below any more — see lib/customer-email.ts.
import { customerEmail, productLine, totalLine, detailRows, noteCard, mailableImage } from "./customer-email";
import { BRAND, BUSINESS_ADDRESS, button, emailUrl } from "./email-brand";

// The mailing address and the opt-out link now live with the shells that render
// them — lib/email-brand.ts and lib/customer-email.ts — so there is no second
// copy here to drift out of step.

const API_KEY_ENV = ["RESEND_API_KEY", "wynnessentials_site"];
const resendApiKey = () => API_KEY_ENV.map(name => process.env[name]).find(Boolean);

// Minimal HTML escaping so customer-supplied text (names, review bodies, product
// titles) can't inject markup into the notification email.
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const money = (cents: number | null | undefined, currency = "usd") =>
  cents == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

export type EmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  /**
   * The sender display name for this message — one of SENDER. Omitted, the
   * message goes out under whatever NOTIFY_FROM is configured with, which is
   * what every message did before these existed.
   */
  fromName?: string;
};

/**
 * Outcome of one send attempt.
 *
 * `certainNotSent` is the honest half: true only when we KNOW nothing reached a
 * mailbox — no API key, no recipient, or an explicit rejection from Resend. A
 * thrown fetch (timeout, socket reset) leaves it false, because the request may
 * well have been accepted before the connection died. Callers that hold a
 * send-once claim use this to decide whether releasing that claim risks a
 * duplicate: release only when the non-delivery is certain.
 */
export type EmailResult = { ok: boolean; certainNotSent: boolean; providerMessageId?: string };
export type BatchEmailResult = { ok: boolean; certainNotSent: boolean; providerMessageIds?: string[] };

/** Sends up to 100 personalized campaign messages in one Resend request. */
export async function deliverEmailBatch(inputs: EmailInput[]): Promise<BatchEmailResult> {
  const apiKey = resendApiKey();
  if (!apiKey || inputs.length === 0 || inputs.some(input => !input.to)) return { ok: false, certainNotSent: true };
  try {
    const response = await fetch(RESEND_BATCH_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(inputs.map(({ to, subject, html, text, replyTo, headers, fromName }) => ({
        from: fromHeader(fromName), to, subject, html,
        ...(text ? { text } : {}), ...(replyTo ? { reply_to: replyTo } : {}), ...(headers ? { headers } : {}),
      }))),
    });
    if (!response.ok) {
      console.error("Email batch failed", { status: response.status, detail: await response.text().catch(() => "") });
      return { ok: false, certainNotSent: true };
    }
    const result = await response.json().catch(() => null) as { data?: { id?: unknown }[] } | null;
    const ids = Array.isArray(result?.data) ? result.data.map(item => typeof item.id === "string" ? item.id : "") : [];
    return { ok: true, certainNotSent: false, providerMessageIds: ids };
  } catch (error) {
    console.error("Email batch error", error instanceof Error ? error.message : "Unknown error");
    return { ok: false, certainNotSent: false };
  }
}

/** Sends via Resend and reports how it went. Never throws. */
export async function deliverEmail({ to, subject, html, text, replyTo, headers, fromName }: EmailInput): Promise<EmailResult> {
  const apiKey = resendApiKey();
  if (!apiKey) {
    console.info(`Email skipped: no Resend API key set (${API_KEY_ENV.join(" or ")})`, { subject });
    return { ok: false, certainNotSent: true };
  }
  if (!to) {
    console.info("Email skipped: no recipient", { subject });
    return { ok: false, certainNotSent: true };
  }
  const from = fromHeader(fromName);
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      // Resend sends a multipart message when `text` is supplied, so a
      // text-only client still gets a readable copy.
      body: JSON.stringify({ from, to, subject, html, ...(text ? { text } : {}), ...(replyTo ? { reply_to: replyTo } : {}), ...(headers ? { headers } : {}) }),
    });
    if (!response.ok) {
      console.error("Email failed", { status: response.status, detail: await response.text().catch(() => "") });
      // Resend answered and refused: the message was never queued.
      return { ok: false, certainNotSent: true };
    }
    const result = await response.json().catch(() => null) as { id?: unknown } | null;
    return {
      ok: true,
      certainNotSent: false,
      ...(typeof result?.id === "string" ? { providerMessageId: result.id } : {}),
    };
  } catch (error) {
    // The request may or may not have been accepted before this threw.
    console.error("Email error", error instanceof Error ? error.message : "Unknown error");
    return { ok: false, certainNotSent: false };
  }
}

/**
 * Sends an email via Resend. Returns true on a 2xx, false otherwise (including
 * when no API key is set). Never throws — safe to call from webhooks and
 * server actions without a surrounding try/catch.
 */
export async function sendEmail(input: EmailInput): Promise<boolean> {
  return (await deliverEmail(input)).ok;
}

/** Sends an owner-notification email to NOTIFY_TO (defaults to the business inbox). */
export function sendOwnerEmail({ subject, html }: { subject: string; html: string }): Promise<boolean> {
  return sendEmail({ to: process.env.NOTIFY_TO || DEFAULT_TO, subject, html, fromName: SENDER.alerts });
}

const shell = (heading: string, rows: string) => `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;margin:0 auto">
    <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#b39067;font-weight:700;margin:0 0 6px">Wynn Essentials</p>
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;margin:0 0 18px">${heading}</h1>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
  </div>`;

const row = (label: string, value: string) =>
  `<tr><td style="padding:8px 0;color:#6d675f;width:130px;vertical-align:top">${esc(label)}</td><td style="padding:8px 0;font-weight:600">${value}</td></tr>`;

type OrderInfo = {
  totalAmount?: number | null;
  currency?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  orderReference?: string | null;
  items?: { name?: string | null; quantity?: number | null; totalAmount?: number | null }[];
};

/** Formats and sends the "new paid order" alert. */
export async function notifyNewOrder(order: OrderInfo): Promise<boolean> {
  const currency = order.currency ?? "usd";
  const itemLines = (order.items ?? [])
    .map((i) => `${esc(i.name ?? "Item")} × ${esc(i.quantity ?? 1)} — ${money(i.totalAmount, currency)}`)
    .join("<br>") || "—";
  const total = money(order.totalAmount, currency);
  const html = shell("New order received", [
    row("Total", total),
    row("Items", itemLines),
    row("Customer", esc(order.customerName ?? "—")),
    row("Email", esc(order.customerEmail ?? "—")),
    row("Reference", esc(order.orderReference ?? "—")),
  ].join(""));
  return sendOwnerEmail({ subject: `New order — ${total}`, html });
}

type ReviewInfo = {
  productName: string;
  author: string;
  rating: number;
  title?: string | null;
  body: string;
  verified?: boolean;
};

/** Formats and sends the "new review awaiting approval" alert. */
export async function notifyNewReview(review: ReviewInfo): Promise<boolean> {
  const stars = "★".repeat(Math.max(0, Math.min(5, review.rating))) + "☆".repeat(5 - Math.max(0, Math.min(5, review.rating)));
  const html = shell("New review awaiting approval", [
    row("Product", esc(review.productName)),
    row("Rating", `${stars} (${esc(review.rating)}/5)`),
    row("From", `${esc(review.author)}${review.verified ? " · Verified buyer" : ""}`),
    row("Title", esc(review.title || "—")),
    row("Review", esc(review.body)),
    row("Moderate", `<a href="https://wynnessentialsllc.us/admin/reviews" style="color:#b39067">Approve or reject in /admin/reviews</a>`),
  ].join(""));
  return sendOwnerEmail({ subject: `New ${review.rating}★ review — ${review.productName}`, html });
}

type SubscriberInfo = {
  email: string;
  source?: string | null;
};

// Human-readable label for the whitelisted signup sources the subscribe route
// records. A restock waitlist source looks like "waitlist:<product-slug>".
function subscriberSourceLabel(source: string | null | undefined): string {
  if (!source) return "Newsletter";
  if (source.startsWith("waitlist:")) return `Restock waitlist — ${source.slice("waitlist:".length)}`;
  switch (source) {
    case "the-wynn-edit": return "Newsletter (The Wynn Edit)";
    case "first-order-popup": return "First-order popup";
    default: return source;
  }
}

/** Formats and sends the "new newsletter subscriber" alert to the owner. */
export async function notifyNewSubscriber(subscriber: SubscriberInfo): Promise<boolean> {
  const sourceLabel = subscriberSourceLabel(subscriber.source);
  const html = shell("New subscriber", [
    row("Email", esc(subscriber.email)),
    row("Source", esc(sourceLabel)),
    row("Manage", `<a href="https://wynnessentialsllc.us/admin/subscribers" style="color:#b39067">View all subscribers in /admin/subscribers</a>`),
  ].join(""));
  return sendOwnerEmail({ subject: `New subscriber — ${subscriber.email}`, html });
}

type SupportInfo = {
  name: string;
  email: string;
  topic: string;
  message: string;
  orderNumber?: string | null;
};

/**
 * Formats and sends the "new support / issue report" alert to the owner. This
 * covers order issues, website issues, and any other message from the storefront
 * contact form. Reply-To is set to the customer so the owner can respond directly.
 */
export async function notifyNewSupportMessage(msg: SupportInfo): Promise<boolean> {
  const html = shell(`New ${esc(msg.topic).toLowerCase()} message`, [
    row("Topic", esc(msg.topic)),
    row("From", esc(msg.name)),
    row("Email", esc(msg.email)),
    row("Order #", esc(msg.orderNumber || "—")),
    row("Message", esc(msg.message).replace(/\n/g, "<br>")),
    row("Manage", `<a href="https://wynnessentialsllc.us/admin/support" style="color:#b39067">View in /admin/support</a>`),
  ].join(""));
  return sendEmail({
    to: process.env.NOTIFY_TO || DEFAULT_TO,
    subject: `New ${msg.topic} message — ${msg.name}`,
    html,
    replyTo: msg.email,
    fromName: SENDER.alerts,
  });
}

// ---------------------------------------------------------------------------
// Customer-facing emails. These go to the buyer's address, so they only deliver
// once the sending domain is verified in Resend and NOTIFY_FROM points at it.
// Like everything here, they are best-effort and never throw.
// ---------------------------------------------------------------------------

const customerShell = (heading: string, intro: string, body: string, opts: { unsubscribeEmail?: string | null } = {}) => `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:8px 0">
    <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#b39067;font-weight:700;margin:0 0 6px">Wynn Essentials</p>
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:28px;margin:0 0 14px">${heading}</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">${intro}</p>
    ${body}
    <p style="font-size:13px;color:#6d675f;line-height:1.6;margin:26px 0 0">Questions? Just reply to this email or reach us at <a href="mailto:wynnessentialsllc@gmail.com" style="color:#b39067">wynnessentialsllc@gmail.com</a>.</p>
    <p style="font-size:12px;color:#a98f72;margin:22px 0 0">Wynn Essentials · Healthy hair is a practice.</p>
    <p style="font-size:11px;color:#9a938a;line-height:1.6;margin:10px 0 0">${BUSINESS_ADDRESS}</p>
    ${opts.unsubscribeEmail ? `<p style="font-size:11px;color:#9a938a;line-height:1.6;margin:6px 0 0">You're receiving this because you subscribed to Wynn Essentials emails. <a href="${unsubscribeUrl(opts.unsubscribeEmail)}" style="color:#846743">Unsubscribe</a> at any time.</p>` : ""}
  </div>`;

const STORE = "https://wynnessentialsllc.us";
const TEXTURE_PROFILES = [
  { match: "body wave", name: "Body Wave", image: `${STORE}/collections/boho-card-body-wave.webp`, detail: "Soft, flowing waves with natural movement and effortless blending." },
  { match: "bohemian curl", name: "Bohemian Curl", image: `${STORE}/collections/boho-card-bohemian-curl.webp`, detail: "Loose, romantic curls with airy volume and a naturally bohemian finish." },
  { match: "deep wave", name: "Deep Wave", image: `${STORE}/collections/boho-card-deep-wave.webp`, detail: "Defined, dimensional waves with rich texture and lasting visual depth." },
  { match: "spanish curl", name: "Spanish Curl", image: `${STORE}/collections/boho-card-spanish-curl.webp`, detail: "Springy, polished curls with soft definition and lively movement." },
] as const;

const orderedTextures = (items: OrderInfo["items"] = []) => {
  const names = items.map(item => (item.name ?? "").toLowerCase());
  const found = TEXTURE_PROFILES.filter(profile => names.some(name => name.includes(profile.match)));
  return found.length ? found : [TEXTURE_PROFILES[0]];
};

const preorderPanel = (title: string, copy: string, step: number, items: OrderInfo["items"] = []) => {
  const textures = orderedTextures(items);
  const hero = textures[0];
  const textureCards = textures.map(texture => `<td style="padding:6px;text-align:center;vertical-align:top"><img src="${texture.image}" alt="${texture.name}" width="150" style="display:block;width:100%;max-width:150px;height:auto;margin:0 auto 8px;border-radius:10px"><strong style="font-size:12px;color:#4b352a">${texture.name}</strong></td>`).join("");
  return `<table role="presentation" style="width:100%;margin:20px 0;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid #ff8ac7;border-radius:16px;background:#fffaf5">
    <tr><td style="padding:14px 22px;background:#cfb089;color:#302218;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Pre-order update · Step ${step} of 4</td></tr>
    <tr><td style="padding:0"><img src="${hero.image}" alt="${hero.name} Boho Hair" width="558" style="display:block;width:100%;height:auto;max-height:390px;object-fit:cover"></td></tr>
    <tr><td style="padding:26px 24px;text-align:center;background:#fffaf5">
      <h2 style="margin:0 0 9px;color:#3f2d25;font-family:Georgia,serif;font-size:27px;font-weight:400">${title}</h2>
      <p style="margin:0 auto;max-width:470px;color:#55443c;font-size:14px;line-height:1.7">${copy}</p>
      <p style="margin:15px auto 0;color:#8a5971;font-size:13px;line-height:1.6"><strong>${hero.name}</strong> · ${hero.detail}</p>
      ${textures.length > 1 ? `<table role="presentation" style="width:100%;margin-top:18px;table-layout:fixed"><tr>${textureCards}</tr></table>` : ""}
    </td></tr>
  </table>`;
};

const preorderReference = (reference: string | null | undefined) =>
  `<p style="font-size:13px;color:#6d675f;margin:18px 0 0">Order reference: <strong>${esc(reference ?? "—")}</strong></p>`;

/** Order confirmation sent once immediately after payment. */
export async function notifyCustomerOrderConfirmation(order: OrderEmailData & OrderInfo): Promise<boolean> {
  if (!order.customerEmail) return false;
  const { subject, html, text } = renderOrderConfirmationEmail(order);
  return sendEmail({ to: order.customerEmail, subject, html, text, fromName: SENDER.confirmation });
}

type PreorderUpdateInfo = Pick<OrderInfo, "customerEmail" | "customerName" | "orderReference" | "items">;

/** Sent from the order dashboard when the Friday batch begins processing. */
export async function notifyCustomerPreorderProcessing(order: PreorderUpdateInfo): Promise<boolean> {
  if (!order.customerEmail) return false;
  const firstName = (order.customerName ?? "").trim().split(/\s+/)[0] || "there";
  const body = `${preorderPanel("Your hair is now processing", "Your Boho Hair pre-order is officially in our current batch. Please allow approximately 7–13 days for processing before shipment. We’ll email you again after your hair has been prepared and quality checked.", 2, order.items)}${preorderReference(order.orderReference)}`;
  return sendEmail({
    to: order.customerEmail,
    subject: `Your Boho Hair pre-order is processing${order.orderReference ? ` — ${order.orderReference}` : ""}`,
    html: customerShell("Your pre-order is in progress", `Hi ${esc(firstName)}, your Boho Hair order has moved into processing.`, body),
  });
}

/** Sent from the order dashboard after the hair is inspected and packed. */
export async function notifyCustomerPreorderQualityCheck(order: PreorderUpdateInfo): Promise<boolean> {
  if (!order.customerEmail) return false;
  const firstName = (order.customerName ?? "").trim().split(/\s+/)[0] || "there";
  const body = `${preorderPanel("Prepared with care", "Your Boho Hair has been prepared, inspected, and packaged with care. It is now being readied for shipment. Your next email will include tracking as soon as your package is on the way.", 3, order.items)}${preorderReference(order.orderReference)}`;
  return sendEmail({
    to: order.customerEmail,
    subject: `Your Boho Hair pre-order passed quality check${order.orderReference ? ` — ${order.orderReference}` : ""}`,
    html: customerShell("Quality check complete", `Hi ${esc(firstName)}, your pre-order is one step closer to you.`, body),
  });
}

/**
 * Welcome email for a brand-new subscriber. When productName is set, it's a
 * restock-waitlist signup and the copy confirms we'll notify them when that
 * product is back; otherwise it's a newsletter ("The Wynn Edit") welcome.
 *
 * The first-order offer no longer routes through here — it has its own branded
 * message in notifyFirstOrderWelcome(), which is the only place a promotion
 * code is ever put in front of a subscriber.
 */
export async function notifySubscriberWelcome({ email, productName }: { email: string; productName?: string | null }): Promise<boolean> {
  if (!email) return false;
  if (productName) {
    const message = customerEmail({
      subject: `You're on the waitlist — ${productName}`,
      preheader: `We'll email you the moment ${productName} is back.`,
      eyebrow: "YOU'RE ON THE LIST",
      heading: "We&rsquo;ll tell you<br>the moment it&rsquo;s back.",
      intro: `Thanks for your interest in <strong>${esc(productName)}</strong>.`,
      bodyHtml: noteCard(`We&rsquo;ll email you once &mdash; as soon as <strong>${esc(productName)}</strong> is back in stock. No need to check back, and nothing else is added to your inbox.`),
      cta: { label: "Browse the essentials", url: emailUrl("/#shop") },
      text: `We'll email you once — as soon as ${productName} is back in stock. No need to check back, and nothing else is added to your inbox.`,
    });
    return sendEmail({ to: email, subject: message.subject, html: message.html, text: message.text, fromName: SENDER.welcome });
  }
  // Plain newsletter signup: the branded Wynn Edit welcome owns this copy.
  return (await notifyWynnEditWelcome({ email })).ok;
}

/**
 * The first-order welcome — the branded marketing email for someone who opted
 * in through the WELCOME15 popup, composed in lib/first-order-welcome-email.ts.
 *
 * Marketing mail, treated as such: one-click unsubscribe headers, a visible
 * unsubscribe link, the mailing address, a plain-text alternative, and a
 * reply-to that reaches a human.
 *
 * Like the Wynn Edit welcome it refuses to send when no unsubscribe signing
 * secret is configured, because the opt-out link in the footer would be dead.
 * It also requires a live offer: the caller resolves that from
 * lib/first-order-offer.ts and falls back to the plain welcome rather than
 * emailing a code the checkout cannot accept.
 */
export async function notifyFirstOrderWelcome({ email, offer }: { email: string; offer: FirstOrderOffer }): Promise<EmailResult> {
  if (!email) return { ok: false, certainNotSent: true };
  if (!canSignUnsubscribe()) {
    console.error("First-order welcome skipped: no unsubscribe signing secret set (UNSUBSCRIBE_SECRET), so the opt-out link would not work", { to: email });
    return { ok: false, certainNotSent: true };
  }
  const { subject, html, text } = firstOrderWelcomeEmail({ email, offer });
  return deliverEmail({
    to: email,
    subject,
    html,
    text,
    replyTo: DEFAULT_TO,
    fromName: SENDER.welcome,
    headers: listUnsubscribeHeaders(email, { oneClick: true }),
  });
}

/**
 * The Wynn Edit welcome — the branded marketing email for a newsletter
 * subscriber, composed in lib/wynn-edit-email.ts.
 *
 * This is MARKETING mail and is treated as such: one-click unsubscribe headers,
 * a visible unsubscribe link, the mailing address, a plain-text alternative,
 * and a reply-to that reaches a human rather than a no-reply address.
 *
 * It refuses to send when no unsubscribe signing secret is configured, because
 * the opt-out link in the footer would be dead — an email nobody can leave is
 * worse than an email that was never sent. Returns true only when the provider
 * accepted the send, so callers can avoid claiming an email is on its way when
 * it is not.
 */
export async function notifyWynnEditWelcome({ email }: { email: string }): Promise<EmailResult> {
  if (!email) return { ok: false, certainNotSent: true };
  if (!canSignUnsubscribe()) {
    console.error("The Wynn Edit welcome skipped: no unsubscribe signing secret set (UNSUBSCRIBE_SECRET), so the opt-out link would not work", { to: email });
    return { ok: false, certainNotSent: true };
  }
  const { subject, html, text } = wynnEditWelcomeEmail({ email });
  return deliverEmail({
    to: email,
    subject,
    html,
    text,
    replyTo: DEFAULT_TO,
    fromName: SENDER.welcome,
    headers: listUnsubscribeHeaders(email, { oneClick: true }),
  });
}

/** Abandoned-cart reminder: the items left behind + a link back to the shop. */
export async function notifyAbandonedCart({ email, items, subtotal, promoCode, promoLabel }: {
  email: string;
  /** `slug` is stored alongside the name by /api/abandoned, and is what finds the photograph. */
  items: { slug?: string | null; name?: string | null; quantity?: number | null; price?: number | null }[];
  subtotal?: number | null;
  promoCode?: string | null;
  promoLabel?: string | null;
}): Promise<boolean> {
  if (!email || !items?.length) return false;
  const lines = items.map(i => productLine({
    name: i.name ?? "Item",
    meta: `Qty ${i.quantity ?? 1}`,
    amount: i.price == null ? null : money(Math.round(i.price * 100)),
    image: mailableImage(i.slug),
  })).join("");
  const code = promoCode
    ? noteCard(`Still deciding? Use <strong>${esc(promoCode)}</strong> for ${esc(promoLabel || "a discount")} on one eligible order. Offer availability is confirmed at checkout.`)
    : "";
  const message = customerEmail({
    subject: "You left something in your bag",
    preheader: "Your picks are still here whenever you're ready.",
    eyebrow: "YOUR BAG IS WAITING",
    heading: "Still here,<br>whenever you are.",
    intro: "Nothing has moved &mdash; your hair-care picks are exactly where you left them.",
    bodyHtml: `${lines}${subtotal != null ? totalLine("Subtotal", money(subtotal)) : ""}${code ? `<div style="margin-top:26px">${code}</div>` : ""}`,
    cta: { label: "Return to your bag", url: emailUrl("/#shop") },
    unsubscribeEmail: email,
    text: [
      ...items.map(i => `  · ${i.name ?? "Item"} × ${i.quantity ?? 1}${i.price == null ? "" : ` — ${money(Math.round(i.price * 100))}`}`),
      ...(subtotal != null ? ["", `Subtotal: ${money(subtotal)}`] : []),
      ...(promoCode ? ["", `Still deciding? Use ${promoCode} for ${promoLabel || "a discount"} on one eligible order. Offer availability is confirmed at checkout.`] : []),
    ].join("\n"),
  });
  return sendEmail({
    to: email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    fromName: SENDER.bag,
    headers: listUnsubscribeHeaders(email),
  });
}

/** "Back in stock" email for a customer who joined a product's restock waitlist. */
export async function notifyCustomerRestock({ email, productName, productUrl }: { email: string; productName: string; productUrl: string }): Promise<boolean> {
  if (!email) return false;
  const slug = productUrl.split("/").pop()?.replace(/[#?].*$/, "") ?? null;
  const message = customerEmail({
    subject: `${productName} is back in stock`,
    preheader: `${productName} is available again.`,
    eyebrow: "BACK IN STOCK",
    heading: "It&rsquo;s back.",
    intro: `You asked us to tell you when <strong>${esc(productName)}</strong> returned. It has.`,
    bodyHtml: productLine({ name: productName, meta: "Back in stock", image: mailableImage(slug) }),
    cta: { label: `Shop ${productName}`, url: productUrl },
    text: `${productName} is back in stock. You asked us to tell you when it returned — this is that one email.`,
  });
  return sendEmail({ to: email, subject: message.subject, html: message.html, text: message.text, fromName: SENDER.restock });
}

type ShippedInfo = OrderInfo & { trackingNumber?: string | null; carrier?: string | null };

/** Shipping confirmation with tracking, sent when an order is marked shipped. */
export async function notifyCustomerShipped(order: ShippedInfo): Promise<boolean> {
  if (!order.customerEmail) return false;
  const firstName = (order.customerName ?? "").trim().split(/\s+/)[0] || "there";
  const includesPreorder = (order.items ?? []).some(item => item.name?.includes("PRE-ORDER"));
  const url = trackingUrl(order.carrier, order.trackingNumber);
  if (includesPreorder) {
    const carrierLabel = order.carrier ? esc(order.carrier.toUpperCase()) : "Carrier";
    const trackingLine = order.trackingNumber
      ? `<table style="width:100%;border-collapse:collapse;font-size:15px">
           <tr><td style="padding:8px 0;color:#6d675f;width:130px">Carrier</td><td style="padding:8px 0;font-weight:600">${carrierLabel}</td></tr>
           <tr><td style="padding:8px 0;color:#6d675f">Tracking #</td><td style="padding:8px 0;font-weight:600">${esc(order.trackingNumber)}</td></tr>
         </table>
         ${url ? `<p style="margin:20px 0 0"><a href="${url}" style="display:inline-block;background:#c8aa82;color:#111;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:.06em;padding:14px 22px">TRACK YOUR PACKAGE</a></p>` : ""}`
      : `<p style="font-size:14px">Your order is on its way.</p>`;
    const care = `<div style="margin:24px 0;padding:22px;background:#f2e2cc;border-radius:12px"><h3 style="margin:0 0 10px;font-family:Georgia,serif;font-size:21px;font-weight:400">Keep your dream hair beautiful</h3><p style="margin:0;color:#55443c;font-size:13px;line-height:1.7">Detangle gently from the ends upward, refresh with lightweight product, protect nightly with satin, and always let the hair dry completely before bed.</p><p style="margin:16px 0 0"><a href="${STORE}/braiding-hair#care-guide" style="display:inline-block;background:#ff3fa4;color:#fff;text-decoration:none;font-weight:800;font-size:11px;letter-spacing:.08em;padding:12px 18px">VIEW THE FULL CARE GUIDE</a></p></div>`;
    const body = `${preorderPanel("Your pre-order is on the way", "Your Boho Hair has completed processing and quality check, and your package is now on the way to you. Use the tracking information below to follow its journey.", 4, order.items)}${trackingLine}${care}<p style="font-size:13px;color:#6d675f;margin:20px 0 0">Order reference: <strong>${esc(order.orderReference ?? "—")}</strong></p>`;
    return sendEmail({
      to: order.customerEmail,
      subject: `Your Boho Hair pre-order is on the way${order.orderReference ? ` — ${order.orderReference}` : ""}`,
      html: customerShell("Your pre-order is on the way!", `Hi ${esc(firstName)}, good news — your order has shipped.`, body),
      fromName: SENDER.shipping,
    });
  }

  const rows: { label: string; value: string }[] = [];
  if (order.trackingNumber) {
    rows.push({ label: "Carrier", value: order.carrier ? order.carrier.toUpperCase() : "Carrier" });
    rows.push({ label: "Tracking #", value: order.trackingNumber });
  }
  if (order.orderReference) rows.push({ label: "Order", value: order.orderReference });
  const message = customerEmail({
    subject: `Your Wynn Essentials order has shipped${order.orderReference ? ` — ${order.orderReference}` : ""}`,
    preheader: order.trackingNumber ? `Tracking ${order.trackingNumber} is on its way to you.` : "Your order is on its way.",
    eyebrow: "ON ITS WAY",
    heading: "It&rsquo;s out the door.",
    intro: `Hi ${esc(firstName)} &mdash; your order has shipped.`,
    bodyHtml: rows.length ? detailRows(rows) : "",
    cta: url ? { label: "Track your package", url } : null,
    closing: "Once it lands, we&rsquo;ll send you everything you need to know about what&rsquo;s inside.",
    text: [
      ...rows.map(r => `${r.label}: ${r.value}`),
      ...(url ? ["", `Track your package: ${url}`] : []),
    ].join("\n"),
  });
  return sendEmail({ to: order.customerEmail, subject: message.subject, html: message.html, text: message.text, fromName: SENDER.shipping });
}

/**
 * The post-purchase education email — what each product in an order is, what it
 * does, and when to use it — composed in lib/product-education-email.ts and
 * sent by the product-education cron once the order has had time to arrive.
 *
 * It is about products the customer already owns and sells nothing, so unlike
 * the two welcomes it does not refuse to send when no unsubscribe secret is
 * configured; the renderer drops the opt-out line instead of printing a link
 * that would not work. It still carries List-Unsubscribe headers whenever the
 * link can be signed, and the mailing address either way.
 *
 * Not one-click: RFC 8058 one-click belongs on bulk marketing, and a mailbox
 * scanner should not be able to opt someone out by opening a message about the
 * order they just received.
 */
export async function notifyProductEducation(input: EducationEmailInput): Promise<EmailResult> {
  if (!input.email || input.cards.length === 0) return { ok: false, certainNotSent: true };
  const { subject, html, text } = productEducationEmail(input);
  return deliverEmail({
    to: input.email,
    subject,
    html,
    text,
    replyTo: DEFAULT_TO,
    fromName: SENDER.care,
    ...(canSignUnsubscribe() ? { headers: listUnsubscribeHeaders(input.email) } : {}),
  });
}

// Post-purchase review request. Sent by the review-requests cron a week or two
// after an order, asking the customer to review what they bought. Each product
// links to its storefront modal, which has the "Write a Review" form. URLs are
// passed in (like the restock email) so this stays URL-agnostic.
export async function notifyReviewRequest({ email, customerName, orderReference, products }: { email: string; customerName?: string | null; orderReference?: string | null; products: { name: string; url: string; slug?: string | null }[] }): Promise<boolean> {
  if (!email || products.length === 0) return false;
  const firstName = (customerName ?? "").trim().split(/\s+/)[0] || "there";
  const lines = products.map(p => `${productLine({
    name: p.name,
    meta: "How has it worked for your hair?",
    image: mailableImage(p.slug),
  })}<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px"><tr><td>${button("LEAVE A REVIEW", p.url, "left", BRAND.cream, BRAND.black, BRAND.black)}</td></tr></table>`).join("");
  const message = customerEmail({
    subject: "How are you loving your Wynn Essentials?",
    preheader: "A minute of your time helps someone else find what works.",
    eyebrow: "A FEW WEEKS IN",
    heading: "How&rsquo;s your hair<br>loving it?",
    intro: `Hi ${esc(firstName)} &mdash; you&rsquo;ve had a little while with your order now. An honest word about how it went helps the next person find what works for their hair.`,
    bodyHtml: lines,
    ...(orderReference ? { closing: `Order reference: ${esc(orderReference)}` } : {}),
    unsubscribeEmail: email,
    text: products.map(p => `  · ${p.name} — leave a review: ${p.url}`).join("\n"),
  });
  return sendEmail({
    to: email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    fromName: SENDER.review,
    headers: listUnsubscribeHeaders(email),
  });
}
