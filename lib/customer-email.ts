// The branded shell for Wynn Essentials' shorter customer emails.
//
// The order confirmation, the two welcomes and the product-education email each
// have their own file because each has a bespoke centrepiece — an itemised
// order, an offer card, a section per product. The five shorter messages have no
// such centrepiece, and were still going out on a plain Arial block with no
// logo, no colour, and no brand footer: a shipping notice or an abandoned-cart
// reminder looked nothing like the receipt that came before it.
//
// This is the shell they share instead. Same foundation as the other four —
// cream page, white 600px body, the logo band, a sky-blue opening cut by the
// pink rule, the black brand footer — so every message the brand sends now
// looks like it came from the same place.
//
// Everything it renders is live text over table layout with inline styles, and
// each message carries a plain-text alternative, so an inbox with images off (or
// no HTML at all) still gets the whole message.

import { unsubscribeUrl, canSignUnsubscribe } from "./unsubscribe";
import { products, type Product } from "../app/data";
import {
  BRAND, BUSINESS_ADDRESS, LOGO, RESPONSIVE_STYLE, SUPPORT_EMAIL,
  button, emailUrl, esc, eyebrow as eyebrowTag, heading as headingTag, paragraph,
} from "./email-brand";

/**
 * The photograph to put in an email for a catalog slug.
 *
 * Outlook for Windows renders neither WebP nor AVIF, and six of the catalog's
 * products are photographed only in those formats — so every product has a JPEG
 * built for email at public/email/products/<slug>.jpg (npm run email:images),
 * and that is what is used. It is 256px wide for a row that displays at 64,
 * rather than a full-size storefront photograph sent to an inbox.
 *
 * The catalog is still the source of the alt text, and still decides whether a
 * product has photography at all.
 */
export function mailableImage(slug: string | null | undefined): { src: string; alt: string } | null {
  if (!slug) return null;
  const product: Product | undefined = products.find(p => p.slug === slug);
  const first = product?.images?.[0];
  if (!product || !first) return null;
  return { src: `/email/products/${product.slug}.jpg`, alt: first.alt };
}

// ---------------------------------------------------------------------------
// Body blocks
// ---------------------------------------------------------------------------

/**
 * A product line with its photograph, matching the order confirmation's rows —
 * this is the shape a customer has already seen on their receipt.
 */
export function productLine({ name, meta, amount, image }: {
  name: string;
  meta?: string | null;
  amount?: string | null;
  image?: { src: string; alt: string } | null;
}): string {
  const photo = image
    ? `<img src="${esc(emailUrl(image.src))}" width="64" alt="${esc(image.alt)}" style="display:block;width:64px;max-width:64px;height:auto;border:0;outline:none;text-decoration:none;background-color:${BRAND.cream}">`
    : `<div style="width:64px;height:64px;background-color:${BRAND.cream}">&nbsp;</div>`;
  return `
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${BRAND.line}">
      <tr>
        <td width="64" valign="top" style="width:64px;padding:18px 14px 18px 0">${photo}</td>
        <td valign="top" style="padding:18px 10px 18px 0;font-family:${BRAND.sans};font-size:15px;line-height:21px;font-weight:bold;color:${BRAND.black};word-break:break-word">
          ${esc(name)}
          ${meta ? `<span style="display:block;margin-top:5px;font-size:13px;line-height:19px;font-weight:normal;color:${BRAND.muted}">${esc(meta)}</span>` : ""}
        </td>
        ${amount ? `<td width="82" valign="top" align="right" style="width:82px;padding:18px 0;font-family:${BRAND.sans};font-size:15px;line-height:21px;font-weight:bold;color:${BRAND.black};white-space:nowrap">${esc(amount)}</td>` : ""}
      </tr>
    </table>`;
}

/** A right-aligned total under a set of product lines. */
export function totalLine(label: string, value: string): string {
  return `
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${BRAND.line}">
      <tr>
        <td style="padding:14px 0 0;font-family:${BRAND.sans};font-size:16px;line-height:22px;font-weight:bold;letter-spacing:.04em;color:${BRAND.black}">${esc(label)}</td>
        <td align="right" style="padding:14px 0 0;font-family:${BRAND.sans};font-size:16px;line-height:22px;font-weight:bold;color:${BRAND.black};white-space:nowrap">${esc(value)}</td>
      </tr>
    </table>`;
}

/** A label/value table — tracking details, an order reference. */
export function detailRows(rows: { label: string; value: string }[]): string {
  return `
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      ${rows.map(r => `<tr>
        <td width="120" valign="top" style="width:120px;padding:9px 12px 9px 0;font-family:${BRAND.sans};font-size:14px;line-height:20px;color:${BRAND.muted}">${esc(r.label)}</td>
        <td valign="top" style="padding:9px 0;font-family:${BRAND.sans};font-size:15px;line-height:20px;font-weight:bold;color:${BRAND.black};word-break:break-word">${esc(r.value)}</td>
      </tr>`).join("")}
    </table>`;
}

/** A card that stands a code or a short statement out of the surrounding copy. */
export function noteCard(html: string): string {
  return `
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background-color:${BRAND.white};border:2px solid ${BRAND.black}">
      <tr><td style="padding:20px 22px;font-family:${BRAND.sans};font-size:15px;line-height:23px;color:${BRAND.black}">${html}</td></tr>
    </table>`;
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export type CustomerEmailInput = {
  subject: string;
  /** The inbox preview line. Never empty — an empty one shows raw markup. */
  preheader: string;
  eyebrow: string;
  /** May contain entities; not escaped, so callers pass display-ready HTML. */
  heading: string;
  /** The opening paragraph, under the pink rule. */
  intro: string;
  /** The cream content area: product lines, detail rows, a note card. */
  bodyHtml?: string;
  /** The main call to action, under the body. */
  cta?: { label: string; url: string } | null;
  /** A closing line in the sky block above the footer. */
  closing?: string | null;
  /**
   * Marketing mail: renders the opt-out line for this address. Omitted, the
   * footer carries the transactional note instead — this message is about an
   * order, and there is nothing to unsubscribe from.
   */
  unsubscribeEmail?: string | null;
  /** The plain-text alternative body, between the intro and the sign-off. */
  text: string;
};

export function customerEmail(input: CustomerEmailInput): { subject: string; preheader: string; html: string; text: string } {
  const { subject, preheader, eyebrow, heading, intro, bodyHtml, cta, closing, unsubscribeEmail, text: bodyText } = input;
  // Never render a dead opt-out: without a signing secret the link cannot be
  // verified, so the line is dropped rather than pointing at a page that would
  // refuse her.
  const optOut = unsubscribeEmail && canSignUnsubscribe() ? unsubscribeUrl(unsubscribeEmail) : null;

  const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>${RESPONSIVE_STYLE}</style>
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

        <!-- Opening -->
        <tr>
          <td class="px" bgcolor="${BRAND.sky}" style="background-color:${BRAND.sky};padding:34px 34px 38px">
            ${eyebrowTag(eyebrow)}
            ${headingTag(heading, 40)}
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px">
              <tr><td width="216" height="9" bgcolor="${BRAND.pink}" style="width:216px;height:9px;background-color:${BRAND.pink};font-size:0;line-height:9px">&nbsp;</td></tr>
            </table>
            ${paragraph(intro, "margin-top:24px")}
          </td>
        </tr>
${bodyHtml || cta ? `
        <!-- Body -->
        <tr>
          <td class="px" bgcolor="${BRAND.cream}" style="background-color:${BRAND.cream};padding:36px 34px 34px">
            ${bodyHtml ?? ""}
            ${cta ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:${bodyHtml ? "28px" : "0"} 0 0"><tr><td>${button(esc(cta.label.toUpperCase()), cta.url)}</td></tr></table>` : ""}
          </td>
        </tr>` : ""}
${closing ? `
        <!-- Closing -->
        <tr>
          <td class="px" align="center" bgcolor="${BRAND.sky}" style="background-color:${BRAND.sky};padding:34px 34px 36px;text-align:center">
            ${paragraph(closing, "margin:0;font-size:17px;line-height:27px")}
          </td>
        </tr>` : ""}

        <!-- Footer -->
        <tr>
          <td class="px" align="center" bgcolor="${BRAND.black}" style="background-color:${BRAND.black};padding:38px 34px 40px;text-align:center">
            <p style="margin:0;font-family:${BRAND.serif};font-size:28px;line-height:34px;color:${BRAND.white}">Healthy hair is a practice.</p>
            <p style="margin:16px 0 0;font-family:${BRAND.sans};font-size:10px;line-height:16px;letter-spacing:.18em;text-transform:uppercase;color:${BRAND.footerMuted}">BLACK WOMEN-OWNED &middot; LOS ANGELES &middot; EST. 2020</p>
            <p style="margin:20px 0 0;font-family:${BRAND.sans};font-size:12px;line-height:19px;color:${BRAND.footerMuted}">Questions? Just reply to this email &mdash; a real person reads it &mdash; or write to <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND.white}">${SUPPORT_EMAIL}</a>.</p>
            <p style="margin:18px 0 0;font-family:${BRAND.sans};font-size:11px;line-height:18px;color:#8d857a">${esc(BUSINESS_ADDRESS)}</p>
            <p style="margin:8px 0 0;font-family:${BRAND.sans};font-size:11px;line-height:18px;color:#8d857a">${optOut
              ? `You&rsquo;re receiving this because you asked for Wynn Essentials emails. It never affects your order, shipping, or account emails. <a href="${esc(optOut)}" style="color:${BRAND.white}"><strong>Unsubscribe</strong></a> at any time.`
              : `This is a transactional message about your order, not marketing, so there is nothing to unsubscribe from.`}</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    eyebrow.toUpperCase(),
    "",
    // The heading is display HTML; the plain-text copy is built from the same
    // words with the entities resolved.
    heading.replace(/<br\s*\/?>/gi, " ").replace(/&rsquo;/g, "’").replace(/&mdash;/g, "—").replace(/&amp;/g, "&").replace(/<[^>]+>/g, "").toUpperCase(),
    "",
    intro.replace(/<br\s*\/?>/gi, "\n").replace(/&rsquo;/g, "’").replace(/&mdash;/g, "—").replace(/&amp;/g, "&").replace(/<[^>]+>/g, ""),
    "",
    bodyText,
    ...(cta ? ["", `${cta.label}: ${cta.url}`] : []),
    ...(closing ? ["", "----------------------------------------", closing.replace(/<[^>]+>/g, "")] : []),
    "",
    "----------------------------------------",
    "Healthy hair is a practice.",
    "Black women-owned · Los Angeles · Est. 2020",
    "",
    `Questions? Reply to this email — a real person reads it — or write to ${SUPPORT_EMAIL}.`,
    "",
    BUSINESS_ADDRESS,
    "",
    optOut
      ? `You're receiving this because you asked for Wynn Essentials emails. It never affects your order, shipping, or account emails.\nUnsubscribe: ${optOut}`
      : "This is a transactional message about your order, not marketing, so there is nothing to unsubscribe from.",
    "",
  ].join("\n");

  return { subject, preheader, html, text };
}
