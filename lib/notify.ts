// Owner notifications via Resend (https://resend.com). Best-effort by design:
// a missing API key or a failed send is logged but NEVER throws, so it can be
// dropped into the checkout webhook and the review handler without any risk of
// blocking an order or a review submission.
//
// Configuration (all read from the environment, so no secret is ever in code):
//   RESEND_API_KEY  - required to actually send. Without it, sends are skipped.
//   NOTIFY_TO       - where owner alerts go. Defaults to the business inbox.
//   NOTIFY_FROM     - the From address. Until the sending domain is verified in
//                     Resend, this must stay "onboarding@resend.dev" and can
//                     only deliver to the Resend account's own email. Once
//                     wynnessentialsllc.us is verified, set this to something
//                     like "Wynn Essentials <notifications@wynnessentialsllc.us>".

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TO = "wynnessentialsllc@gmail.com";
const DEFAULT_FROM = "Wynn Essentials <onboarding@resend.dev>";

// The Resend API key, read from the environment. RESEND_API_KEY is the standard
// name; wynnessentials_site is also accepted so the Vercel variable can be named
// either way. First match wins.
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

/**
 * Sends a plain owner-notification email. Returns true on a 2xx from Resend,
 * false otherwise (including when RESEND_API_KEY is not set). Never throws.
 */
export async function sendOwnerEmail({ subject, html }: { subject: string; html: string }): Promise<boolean> {
  const apiKey = resendApiKey();
  if (!apiKey) {
    console.info(`Notification skipped: no Resend API key set (${API_KEY_ENV.join(" or ")})`, { subject });
    return false;
  }
  const to = process.env.NOTIFY_TO || DEFAULT_TO;
  const from = process.env.NOTIFY_FROM || DEFAULT_FROM;
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!response.ok) {
      console.error("Notification email failed", { status: response.status, detail: await response.text().catch(() => "") });
      return false;
    }
    return true;
  } catch (error) {
    console.error("Notification email error", error instanceof Error ? error.message : "Unknown error");
    return false;
  }
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
