// The Wynn Essentials order-confirmation email.
//
// This module owns the rendering only: it takes the order row that
// lib/record-order.ts builds from a Stripe Checkout Session and returns the
// subject, HTML and plain-text bodies. lib/notify.ts still owns sending, so the
// webhook and the reconcile cron keep their existing once-only behaviour.
//
// Email-client constraints this file is written against:
//   * table-based layout, every style inline (no external or class-only styling
//     that a client could strip — the <style> block only carries the mobile
//     media query, which is a progressive enhancement);
//   * 600px content width, fluid below that;
//   * live text for every piece of order information, so a blocked-image
//     inbox still shows what was bought and what was paid;
//   * JPEG/PNG images only (WebP and AVIF are not safe in Outlook), served from
//     absolute production URLs;
//   * no JavaScript, forms, video, or positioned/floated layout.
import { products, type Product } from "../app/data";
import { trackingUrl } from "./carrier-tracking";

// ---------------------------------------------------------------------------
// Types — a superset of the row returned by orderRowFromSession(), so the
// webhook and the reconcile cron can pass their row straight through.
// ---------------------------------------------------------------------------

export type OrderEmailItem = {
  priceId?: string | null;
  productId?: string | null;
  name?: string | null;
  quantity?: number | null;
  unitAmount?: number | null;
  totalAmount?: number | null;
};

export type OrderEmailData = {
  sessionId?: string | null;
  orderReference?: string | null;
  currency?: string | null;
  subtotalAmount?: number | null;
  discountAmount?: number | null;
  shippingAmount?: number | null;
  taxAmount?: number | null;
  totalAmount?: number | null;
  customerName?: string | null;
  customerEmail?: string | null;
  // Stripe's collected_information.shipping_details, stored as jsonb. Typed as
  // unknown and normalized defensively so a shape change can never throw inside
  // a webhook.
  shippingAddress?: unknown;
  items?: OrderEmailItem[] | null;
  // Present only once an order has been marked shipped in /admin/orders. The
  // confirmation email renders a tracking block when they are set and a
  // "tracking is next" line when they are not.
  trackingNumber?: string | null;
  carrier?: string | null;
};

// ---------------------------------------------------------------------------
// Brand tokens — the storefront's own values (app/globals.css), so the email
// and the website cannot drift apart.
// ---------------------------------------------------------------------------

export const BRAND = {
  sky: "#7bc8ef",        // .boho-editorial sky blue
  pink: "#ff65a8",       // .boho-portrait accent pink
  cream: "#f4eadc",      // .boho-hair warm cream
  linen: "#ece6dd",      // --linen
  black: "#111111",      // --black
  white: "#ffffff",
  muted: "#5c564d",      // --muted
  line: "#e2dad0",
  footerMuted: "#b8b0a5",
  serif: "Georgia,'Times New Roman',Times,serif",   // --font-display
  sans: "Arial,Helvetica,sans-serif",               // --font-sans
} as const;

const SUPPORT_EMAIL = "wynnessentialsllc@gmail.com";
// Physical mailing address, required in the footer of every commercial email we
// send and kept here so the confirmation carries it too.
const BUSINESS_ADDRESS = "Wynn Essentials, LLC · 3680 Wilshire Blvd., Ste P04 A118, Los Angeles, CA 90010";

// The canonical production origin. A transactional email is opened long after it
// was sent, from anywhere, so its images and links must never resolve against a
// localhost or preview origin — an explicitly configured https origin wins,
// otherwise production does.
const PRODUCTION_ORIGIN = "https://wynnessentialsllc.us";

export function emailOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  if (/^https:\/\//i.test(configured) && !/localhost|127\.0\.0\.1/i.test(configured)) return configured;
  return PRODUCTION_ORIGIN;
}

/** Absolute, publicly reachable URL for a site asset or page. */
export function emailUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${emailOrigin()}${path.startsWith("/") ? "" : "/"}${path}`;
}

// Editorial imagery, converted to email-safe JPEG/PNG from the storefront's own
// photography (public/email/). Alt text describes the picture, never the order.
const HERO = {
  src: "/email/order-confirmation-hero.jpg",
  alt: "A Wynn Essentials customer holding a stack of kraft Nourish Organic Oil Blend boxes against a bright blue sky",
};
const WASH_DAY = {
  src: "/email/wash-day-shelf.jpg",
  alt: "Lathyr shampoo, Uplyft and Revaivl conditioners on a warm stone bathroom shelf beside a lit candle",
};
const LOGO = { src: "/email/wynn-essentials-logo.png", alt: "Wynn Essentials" };

// ---------------------------------------------------------------------------
// Escaping and formatting
// ---------------------------------------------------------------------------

/** HTML-escapes any customer- or Stripe-supplied text before it reaches markup. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Minor units (cents) to a display string, in the order's own currency. */
export function money(cents: number | null | undefined, currency = "usd"): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    // An unexpected currency code must never throw inside a webhook.
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }
}

// ---------------------------------------------------------------------------
// Catalog resolution — product photo, size, and a clean display name for each
// purchased line.
// ---------------------------------------------------------------------------

// Formats a client accepts everywhere. WebP and AVIF render as a broken image in
// Outlook for Windows, so they are never used in an email.
const EMAIL_SAFE_IMAGE = /\.(jpe?g|png|gif)$/i;

// Products whose catalog gallery leads with WebP/AVIF, mapped to the existing
// JPEG/PNG shot of the same product already in public/. Checked before the
// gallery so these lines still show real product photography.
const EMAIL_IMAGE_OVERRIDES: Record<string, string> = {
  "thairap-moisture-styling-cream": "/products/thairap-main.jpeg",
  "soft-life-bonnet": "/collections/soft-life-bonnet.jpeg",
  "hair-wellness-bundle": "/collections/hair-wellness-bundle-official.jpg",
  "boho-body-wave-18": "/collections/boho-body-wave.jpg",
  "boho-bohemian-curl-18": "/collections/boho-bohemian-curl.jpg",
  "boho-deep-wave-18": "/collections/boho-deep-wave.jpg",
  "boho-spanish-curl-18": "/collections/boho-spanish-curl.jpg",
};

/**
 * Maps a recorded line item back to the catalog. Regular lines carry the
 * catalog's Stripe product id; inline price_data lines (colours, and variants
 * without their own Stripe price) get an ad-hoc Stripe product, so those fall
 * back to the "Name — Subtitle · Variant · Colour" description the checkout
 * route composes.
 */
export function catalogProductFor(item: OrderEmailItem): Product | undefined {
  if (item.productId) {
    const byId = products.find(p => p.stripeProductId === item.productId);
    if (byId) return byId;
  }
  const name = (item.name ?? "").trim();
  if (!name) return undefined;
  return (
    products.find(p => name === `${p.name} — ${p.subtitle}`) ??
    products.find(p => name.startsWith(`${p.name} — ${p.subtitle}`)) ??
    products.find(p => name.toLowerCase().startsWith(`${p.name.toLowerCase()} `))
  );
}

/** The product photo to show for a line, or null when we have none to show. */
export function emailImageFor(product: Product | undefined, item: OrderEmailItem): { src: string; alt: string } | null {
  if (!product) return null;
  const override = EMAIL_IMAGE_OVERRIDES[product.slug];
  if (override) return { src: override, alt: `${product.name} ${product.subtitle}` };
  // A selected variant with its own gallery (e.g. a scrunchie collection) shows
  // that variant's photo rather than the product default.
  const name = item.name ?? "";
  const variant = product.variants?.find(v => v.length && name.includes(v.length));
  const gallery = [...(variant?.images ?? []), ...(product.images ?? [])];
  const safe = gallery.find(image => EMAIL_SAFE_IMAGE.test(image.src));
  return safe ? { src: safe.src, alt: safe.alt || `${product.name} ${product.subtitle}` } : null;
}

// The checkout route names an inline line "Name — Subtitle · Variant · Colour".
// Everything after the subtitle is a shopper-selected option worth showing.
function selectedOptions(item: OrderEmailItem, product: Product | undefined): string[] {
  const name = (item.name ?? "").trim();
  if (!product || !name.includes(" — ")) return [];
  return name
    .slice(name.indexOf(" — ") + 3)
    .split(" · ")
    .slice(1)
    .map(part => part.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Address + order-status URL
// ---------------------------------------------------------------------------

type AddressLike = { name?: unknown; address?: Record<string, unknown> | null } & Record<string, unknown>;

/**
 * Flattens Stripe's shipping_details into display lines. Written defensively:
 * the column is jsonb, so anything at all could be in it and a bad shape must
 * degrade to "no address block" rather than throw inside the webhook.
 */
export function shippingLines(shippingAddress: unknown): string[] {
  if (!shippingAddress || typeof shippingAddress !== "object") return [];
  const details = shippingAddress as AddressLike;
  const address = (details.address && typeof details.address === "object" ? details.address : details) as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const cityLine = [str(address.city), [str(address.state), str(address.postal_code)].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [
    str(details.name),
    str(address.line1),
    str(address.line2),
    cityLine,
    str(address.country),
  ].filter(Boolean);
}

// Stripe Checkout Session ids are the customer's own order-status key: the
// success page verifies the session with Stripe before showing anything. The
// shape is validated so nothing but a session id can ever reach the href.
export function orderStatusUrl(sessionId: string | null | undefined): string | null {
  if (!sessionId || !/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) return null;
  return emailUrl(`/order/success?session_id=${encodeURIComponent(sessionId)}`);
}

// ---------------------------------------------------------------------------
// View model — built once, then rendered to HTML and to plain text so the two
// bodies can never disagree about the order.
// ---------------------------------------------------------------------------

type LineView = {
  name: string;
  options: string[];
  size: string | null;
  quantity: number;
  unit: string | null;
  total: string;
  image: { src: string; alt: string } | null;
};

type OrderView = {
  firstName: string;
  greetingName: string;
  orderReference: string | null;
  lines: LineView[];
  subtotal: string | null;
  discount: string | null;
  shipping: string | null;
  shippingIsFree: boolean;
  tax: string | null;
  total: string;
  statusUrl: string | null;
  shippingLines: string[];
  tracking: { carrier: string; number: string; url: string | null } | null;
};

export function orderView(order: OrderEmailData): OrderView {
  const currency = order.currency ?? "usd";
  const customerName = (order.customerName ?? "").trim();
  const firstName = customerName.split(/\s+/)[0] ?? "";
  const lines: LineView[] = (order.items ?? []).map(item => {
    const product = catalogProductFor(item);
    const quantity = Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    return {
      name: product ? `${product.name} ${product.subtitle}` : (item.name ?? "Wynn Essentials item"),
      options: selectedOptions(item, product),
      size: product?.size ?? null,
      quantity,
      unit: quantity > 1 && item.unitAmount != null ? money(item.unitAmount, currency) : null,
      total: money(item.totalAmount ?? (item.unitAmount != null ? item.unitAmount * quantity : null), currency),
      image: emailImageFor(product, item),
    };
  });

  const shippingAmount = order.shippingAmount;
  const number = (order.trackingNumber ?? "").trim();

  return {
    firstName,
    // A Stripe session can arrive without a name (wallet checkouts often do).
    greetingName: firstName || "there",
    orderReference: order.orderReference?.trim() || null,
    lines,
    subtotal: order.subtotalAmount != null ? money(order.subtotalAmount, currency) : null,
    discount: order.discountAmount ? `−${money(order.discountAmount, currency)}` : null,
    shipping: shippingAmount != null ? (shippingAmount === 0 ? "FREE" : money(shippingAmount, currency)) : null,
    shippingIsFree: shippingAmount === 0,
    tax: order.taxAmount ? money(order.taxAmount, currency) : null,
    total: money(order.totalAmount, currency),
    statusUrl: orderStatusUrl(order.sessionId),
    shippingLines: shippingLines(order.shippingAddress),
    tracking: number
      ? { carrier: (order.carrier ?? "").trim().toUpperCase() || "Carrier", number, url: trackingUrl(order.carrier, number) }
      : null,
  };
}

// ---------------------------------------------------------------------------
// HTML building blocks
// ---------------------------------------------------------------------------

const eyebrow = (text: string, color: string = BRAND.black) =>
  `<p style="margin:0;font-family:${BRAND.sans};font-size:11px;line-height:16px;letter-spacing:.18em;text-transform:uppercase;font-weight:bold;color:${color}">${text}</p>`;

const heading = (text: string, size: number, color: string = BRAND.black, extra = "") =>
  `<h1 class="h-lg" style="margin:14px 0 0;font-family:${BRAND.serif};font-weight:normal;font-size:${size}px;line-height:1.06;letter-spacing:-.02em;color:${color};mso-line-height-rule:exactly;${extra}">${text}</h1>`;

const paragraph = (html: string, extra = "") =>
  `<p style="margin:18px 0 0;font-family:${BRAND.sans};font-size:15px;line-height:24px;color:${BRAND.black};${extra}">${html}</p>`;

// A bulletproof-enough button: a single-cell table with generous padding, so the
// tap target clears 44px on a phone and the link still looks like a button in
// clients that drop background colours on <a>.
const button = (label: string, url: string, align: "left" | "center" = "left") => `
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="${align}" style="border-collapse:collapse;${align === "center" ? "margin:0 auto;" : ""}">
    <tr>
      <td bgcolor="${BRAND.black}" style="background-color:${BRAND.black};padding:16px 30px;text-align:center">
        <a href="${esc(url)}" style="display:inline-block;font-family:${BRAND.sans};font-size:12px;line-height:16px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.white};text-decoration:none">${label}</a>
      </td>
    </tr>
  </table>`;

// One purchased line: photo, live-text name/options/quantity, line total.
function lineRow(line: LineView): string {
  const meta = [...line.options, line.size, `Qty ${line.quantity}`].filter(Boolean).map(part => esc(String(part))).join(" · ");
  const unit = line.unit ? `<br><span style="color:${BRAND.muted}">${esc(line.unit)} each</span>` : "";
  const photo = line.image
    ? `<img src="${esc(emailUrl(line.image.src))}" width="64" alt="${esc(line.image.alt)}" style="display:block;width:64px;max-width:64px;height:auto;border:0;outline:none;text-decoration:none;background-color:${BRAND.cream}">`
    : `<div style="width:64px;height:64px;background-color:${BRAND.cream}">&nbsp;</div>`;
  return `
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${BRAND.line}">
      <tr>
        <td width="64" valign="top" class="item-photo" style="width:64px;padding:18px 14px 18px 0">${photo}</td>
        <td valign="top" style="padding:18px 10px 18px 0;font-family:${BRAND.sans};font-size:15px;line-height:21px;font-weight:bold;color:${BRAND.black};word-break:break-word">
          ${esc(line.name)}
          <span style="display:block;margin-top:5px;font-size:13px;line-height:19px;font-weight:normal;color:${BRAND.muted}">${meta}${unit}</span>
        </td>
        <td width="82" valign="top" align="right" class="item-price" style="width:82px;padding:18px 0;font-family:${BRAND.sans};font-size:15px;line-height:21px;font-weight:bold;color:${BRAND.black};white-space:nowrap">${esc(line.total)}</td>
      </tr>
    </table>`;
}

const totalsRow = (label: string, value: string, opts: { strong?: boolean; top?: boolean } = {}) => `
  <tr>
    <td style="padding:${opts.strong ? "14px 0 0" : "7px 0 0"};font-family:${BRAND.sans};font-size:${opts.strong ? 16 : 14}px;line-height:22px;color:${opts.strong ? BRAND.black : BRAND.muted};${opts.strong ? "font-weight:bold;letter-spacing:.04em;" : ""}${opts.top ? `border-top:1px solid ${BRAND.line};padding-top:14px;` : ""}">${label}</td>
    <td align="right" style="padding:${opts.strong ? "14px 0 0" : "7px 0 0"};font-family:${BRAND.sans};font-size:${opts.strong ? 16 : 14}px;line-height:22px;font-weight:bold;color:${BRAND.black};white-space:nowrap;${opts.top ? `border-top:1px solid ${BRAND.line};padding-top:14px;` : ""}">${value}</td>
  </tr>`;

const step = (index: number, title: string, copy: string) => `
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr>
      <td width="46" valign="top" style="width:46px;padding:0 0 18px">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr>
            <td width="32" height="32" align="center" valign="middle" bgcolor="${BRAND.black}" style="width:32px;height:32px;background-color:${BRAND.black};border-radius:16px;font-family:${BRAND.sans};font-size:13px;line-height:32px;font-weight:bold;color:${BRAND.white};text-align:center">${index}</td>
          </tr>
        </table>
      </td>
      <td valign="top" style="padding:0 0 18px;font-family:${BRAND.sans};font-size:15px;line-height:21px;font-weight:bold;color:${BRAND.black}">
        ${title}
        <span style="display:block;margin-top:4px;font-size:13px;line-height:20px;font-weight:normal;color:${BRAND.muted}">${copy}</span>
      </td>
    </tr>
  </table>`;

const routineStep = (label: string, copy: string, last = false) => `
  <tr>
    <td style="padding:0 0 ${last ? "0" : "16px"}">
      <p style="margin:0;font-family:${BRAND.sans};font-size:15px;line-height:20px;letter-spacing:.1em;text-transform:uppercase;color:${BRAND.black}">${label}</p>
      <p style="margin:4px 0 0;font-family:${BRAND.sans};font-size:13px;line-height:19px;color:${BRAND.black}">${copy}</p>
    </td>
  </tr>`;

// ---------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------

export function orderConfirmationSubject(order: OrderEmailData): string {
  const reference = order.orderReference?.trim();
  return `Your Wynn Essentials order is confirmed${reference ? ` — ${reference}` : ""}`;
}

export function orderConfirmationHtml(order: OrderEmailData): string {
  const view = orderView(order);
  const preheader = `It's officially on the way${view.orderReference ? ` — order ${view.orderReference}` : ""}. Here's everything you ordered.`;

  const confirmedLine = `ORDER${view.orderReference ? ` #${esc(view.orderReference)}` : ""} &middot; CONFIRMED`;

  const summaryRows = [
    view.subtotal ? totalsRow("Subtotal", esc(view.subtotal)) : "",
    view.discount ? totalsRow("Discount", esc(view.discount)) : "",
    view.shipping ? totalsRow("Shipping", esc(view.shipping)) : "",
    view.tax ? totalsRow("Tax", esc(view.tax)) : "",
    totalsRow("TOTAL", esc(view.total), { strong: true, top: true }),
  ].join("");

  const trackingBlock = view.tracking
    ? `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:26px;background-color:${BRAND.cream}">
         <tr><td style="padding:18px 20px">
           ${eyebrow("TRACKING", BRAND.muted)}
           <p style="margin:6px 0 0;font-family:${BRAND.sans};font-size:14px;line-height:20px;color:${BRAND.black};word-break:break-word">${esc(view.tracking.carrier)} · ${
             view.tracking.url
               ? `<a href="${esc(view.tracking.url)}" style="color:${BRAND.black};font-weight:bold">${esc(view.tracking.number)}</a>`
               : `<strong>${esc(view.tracking.number)}</strong>`
           }</p>
         </td></tr>
       </table>`
    : "";

  const addressBlock = view.shippingLines.length
    ? `<td class="stack stack-col stack-gap" width="50%" valign="top" style="width:50%;padding:0 12px 0 0">
         ${eyebrow("SHIPPING TO", BRAND.muted)}
         <p style="margin:8px 0 0;font-family:${BRAND.sans};font-size:14px;line-height:21px;color:${BRAND.black};word-break:break-word">${view.shippingLines.map(esc).join("<br>")}</p>
       </td>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(orderConfirmationSubject(order))}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  /* Progressive enhancement only: every layout rule below has an inline
     desktop equivalent, so a client that strips this block still renders the
     600px email correctly. */
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
  img{-ms-interpolation-mode:bicubic;border:0;line-height:100%;outline:none;text-decoration:none}
  a{color:inherit}
  @media only screen and (max-width:620px){
    .wrap{width:100%!important;max-width:100%!important}
    .px{padding-left:22px!important;padding-right:22px!important}
    .h-lg{font-size:32px!important}
    .h-md{font-size:26px!important}
    .stack{display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important}
    .stack-col{padding-right:0!important;padding-left:0!important}
    .stack-gap{padding-bottom:24px!important}
    .fluid{width:100%!important;max-width:100%!important;height:auto!important}
    .item-photo{width:56px!important;padding-right:12px!important}
    .item-photo img,.item-photo div{width:56px!important;max-width:56px!important}
    .item-price{width:72px!important}
  }
  @media only screen and (max-width:400px){
    .px{padding-left:18px!important;padding-right:18px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.cream};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${esc(preheader)}</div>
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">&#8199;&#847;&zwnj;&nbsp;&#8199;&#847;&zwnj;&nbsp;&#8199;&#847;&zwnj;&nbsp;&#8199;&#847;&zwnj;&nbsp;&#8199;&#847;&zwnj;&nbsp;&#8199;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background-color:${BRAND.cream}">
  <tr>
    <td align="center" style="padding:0">
      <table role="presentation" class="wrap" width="600" border="0" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;border-collapse:collapse;background-color:${BRAND.white}">

        <!-- Logo -->
        <tr>
          <td align="center" bgcolor="${BRAND.white}" style="background-color:${BRAND.white};padding:26px 24px 22px">
            <a href="${esc(emailUrl("/"))}" style="text-decoration:none"><img src="${esc(emailUrl(LOGO.src))}" width="118" alt="${esc(LOGO.alt)}" style="display:block;width:118px;max-width:118px;height:auto;border:0"></a>
          </td>
        </tr>

        <!-- Confirmation header -->
        <tr>
          <td class="px" bgcolor="${BRAND.sky}" style="background-color:${BRAND.sky};padding:34px 34px 38px">
            ${eyebrow(confirmedLine)}
            ${heading("It&rsquo;s officially<br>on the way.", 44)}
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px">
              <tr><td width="216" height="9" bgcolor="${BRAND.pink}" style="width:216px;height:9px;background-color:${BRAND.pink};font-size:0;line-height:9px">&nbsp;</td></tr>
            </table>
            ${paragraph(`${esc(view.firstName ? `${view.firstName}, your` : "Your")} Wynn Essentials order is in.<br>We&rsquo;re preparing every detail with care.`, "margin-top:24px")}
          </td>
        </tr>

        <!-- Editorial hero -->
        <tr>
          <td bgcolor="${BRAND.sky}" style="background-color:${BRAND.sky};font-size:0;line-height:0">
            <img src="${esc(emailUrl(HERO.src))}" width="600" alt="${esc(HERO.alt)}" class="fluid" style="display:block;width:100%;max-width:600px;height:auto;border:0">
          </td>
        </tr>
        <tr>
          <td class="px" bgcolor="${BRAND.white}" style="background-color:${BRAND.white};padding:16px 34px 14px">
            ${eyebrow("HEALTHY HAIR IS A PRACTICE.")}
          </td>
        </tr>

        <!-- Order summary -->
        <tr>
          <td class="px" bgcolor="${BRAND.white}" style="background-color:${BRAND.white};padding:24px 34px 40px">
            ${eyebrow("WHAT YOU ORDERED", BRAND.muted)}
            <h2 class="h-md" style="margin:12px 0 22px;font-family:${BRAND.serif};font-weight:normal;font-size:32px;line-height:1.1;letter-spacing:-.02em;color:${BRAND.black}">Your essentials, confirmed.</h2>
            ${view.lines.map(lineRow).join("")}
            <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${BRAND.line};margin-top:10px">
              ${summaryRows}
            </table>
            ${trackingBlock}
            ${view.statusUrl ? `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:28px"><tr><td>${button("VIEW MY ORDER", view.statusUrl)}</td></tr></table>` : ""}
            <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:30px;border-top:1px solid ${BRAND.line}">
              <tr><td colspan="2" style="height:24px;font-size:0;line-height:24px">&nbsp;</td></tr>
              <tr>
                ${addressBlock}
                <td class="stack stack-col" width="50%" valign="top" style="width:50%;padding:0">
                  ${eyebrow("QUESTIONS", BRAND.muted)}
                  <p style="margin:8px 0 0;font-family:${BRAND.sans};font-size:14px;line-height:21px;color:${BRAND.black};word-break:break-word">Reply to this email or write to<br><a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND.black};font-weight:bold">${SUPPORT_EMAIL}</a></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- What happens next -->
        <tr>
          <td class="px" bgcolor="${BRAND.cream}" style="background-color:${BRAND.cream};padding:40px 34px 26px">
            ${eyebrow("FROM ORDER TO ROUTINE", BRAND.muted)}
            <h2 class="h-md" style="margin:12px 0 26px;font-family:${BRAND.serif};font-weight:normal;font-size:32px;line-height:1.1;letter-spacing:-.02em;color:${BRAND.black}">Here&rsquo;s what happens next.</h2>
            ${step(1, "Packed with intention", "We check and prepare your order.")}
            ${step(2, "Tracking is next", "You&rsquo;ll receive it as soon as we ship.")}
            ${step(3, "Then, make it your practice", "Simple steps. Consistent care.")}
          </td>
        </tr>

        <!-- Wash day -->
        <tr>
          <td bgcolor="${BRAND.pink}" style="background-color:${BRAND.pink};padding:0">
            <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
              <tr>
                <td class="stack" width="300" valign="top" bgcolor="${BRAND.pink}" style="width:300px;background-color:${BRAND.pink};padding:34px 26px">
                  ${eyebrow("WHEN YOUR BOX ARRIVES")}
                  <h2 class="h-md" style="margin:12px 0 22px;font-family:${BRAND.serif};font-weight:normal;font-size:34px;line-height:1.06;letter-spacing:-.02em;color:${BRAND.black}">Your first wash day, made simple.</h2>
                  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
                    ${routineStep("Cleanse", "Reset without stripping.")}
                    ${routineStep("Condition", "Restore softness and slip.")}
                    ${routineStep("Moisturize", "Give your hair what it needs.", true)}
                  </table>
                </td>
                <td class="stack" width="300" valign="top" bgcolor="${BRAND.pink}" style="width:300px;background-color:${BRAND.pink};font-size:0;line-height:0">
                  <img src="${esc(emailUrl(WASH_DAY.src))}" width="300" alt="${esc(WASH_DAY.alt)}" class="fluid" style="display:block;width:100%;max-width:300px;height:auto;border:0">
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Closing -->
        <tr>
          <td class="px" align="center" bgcolor="${BRAND.sky}" style="background-color:${BRAND.sky};padding:40px 34px 42px;text-align:center">
            ${eyebrow("A LITTLE MORE THAN A RECEIPT")}
            <h2 class="h-md" style="margin:14px 0 0;font-family:${BRAND.serif};font-weight:normal;font-size:34px;line-height:1.1;letter-spacing:-.02em;color:${BRAND.black}">Care begins before delivery.</h2>
            ${paragraph("Explore The Wynn Method while your order travels.", "margin-top:14px")}
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin:26px auto 0">
              <tr><td>${button("EXPLORE THE WYNN METHOD", emailUrl("/#the-wynn-method"), "center")}</td></tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td class="px" align="center" bgcolor="${BRAND.black}" style="background-color:${BRAND.black};padding:38px 34px 40px;text-align:center">
            <p style="margin:0;font-family:${BRAND.serif};font-size:28px;line-height:34px;color:${BRAND.white}">Healthy hair is a practice.</p>
            <p style="margin:16px 0 0;font-family:${BRAND.sans};font-size:10px;line-height:16px;letter-spacing:.18em;text-transform:uppercase;color:${BRAND.footerMuted}">BLACK WOMEN-OWNED &middot; LOS ANGELES &middot; EST. 2020</p>
            <p style="margin:20px 0 0;font-family:${BRAND.sans};font-size:12px;line-height:19px;color:${BRAND.footerMuted}">Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND.white}">${SUPPORT_EMAIL}</a></p>
            ${view.orderReference ? `<p style="margin:8px 0 0;font-family:${BRAND.sans};font-size:12px;line-height:19px;color:${BRAND.footerMuted}">Order reference: ${esc(view.orderReference)}</p>` : ""}
            <p style="margin:18px 0 0;font-family:${BRAND.sans};font-size:11px;line-height:18px;color:#8d857a">${esc(BUSINESS_ADDRESS)}</p>
            <p style="margin:8px 0 0;font-family:${BRAND.sans};font-size:11px;line-height:18px;color:#8d857a">You&rsquo;re receiving this order confirmation because you placed an order at <a href="${esc(emailUrl("/"))}" style="color:#8d857a">wynnessentialsllc.us</a>. It is a transactional message about your purchase.</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Plain-text alternative. Sent alongside the HTML so text-only clients, screen
 * readers in text mode, and spam filters all see the same order.
 */
export function orderConfirmationText(order: OrderEmailData): string {
  const view = orderView(order);
  const rule = "----------------------------------------";
  const out: string[] = [
    `WYNN ESSENTIALS`,
    `ORDER${view.orderReference ? ` #${view.orderReference}` : ""} - CONFIRMED`,
    "",
    "IT'S OFFICIALLY ON THE WAY.",
    "",
    `${view.firstName ? `${view.firstName}, your` : "Your"} Wynn Essentials order is in. We're preparing every detail with care.`,
    "",
    rule,
    "WHAT YOU ORDERED",
    "",
  ];
  for (const line of view.lines) {
    const meta = [...line.options, line.size, `Qty ${line.quantity}`].filter(Boolean).join(" · ");
    out.push(`- ${line.name}`, `  ${meta}${line.unit ? ` · ${line.unit} each` : ""} — ${line.total}`);
  }
  out.push("");
  if (view.subtotal) out.push(`Subtotal: ${view.subtotal}`);
  if (view.discount) out.push(`Discount: ${view.discount}`);
  if (view.shipping) out.push(`Shipping: ${view.shipping}`);
  if (view.tax) out.push(`Tax: ${view.tax}`);
  out.push(`TOTAL: ${view.total}`, "");
  if (view.tracking) {
    out.push(`Tracking: ${view.tracking.carrier} ${view.tracking.number}`);
    if (view.tracking.url) out.push(view.tracking.url);
    out.push("");
  }
  if (view.statusUrl) out.push("VIEW MY ORDER:", view.statusUrl, "");
  if (view.shippingLines.length) out.push("SHIPPING TO", ...view.shippingLines, "");
  out.push(
    rule,
    "HERE'S WHAT HAPPENS NEXT",
    "1. Packed with intention - We check and prepare your order.",
    "2. Tracking is next - You'll receive it as soon as we ship.",
    "3. Then, make it your practice - Simple steps. Consistent care.",
    "",
    "YOUR FIRST WASH DAY, MADE SIMPLE",
    "CLEANSE - Reset without stripping.",
    "CONDITION - Restore softness and slip.",
    "MOISTURIZE - Give your hair what it needs.",
    "",
    `Explore The Wynn Method: ${emailUrl("/#the-wynn-method")}`,
    "",
    rule,
    "Healthy hair is a practice.",
    "BLACK WOMEN-OWNED · LOS ANGELES · EST. 2020",
    "",
    `Questions? Reply to this email or write to ${SUPPORT_EMAIL}.`,
    BUSINESS_ADDRESS,
    "You're receiving this order confirmation because you placed an order at wynnessentialsllc.us. It is a transactional message about your purchase.",
  );
  return out.join("\n");
}

/** Everything lib/notify.ts needs to send the confirmation. */
export function renderOrderConfirmationEmail(order: OrderEmailData): { subject: string; html: string; text: string } {
  return {
    subject: orderConfirmationSubject(order),
    html: orderConfirmationHtml(order),
    text: orderConfirmationText(order),
  };
}
