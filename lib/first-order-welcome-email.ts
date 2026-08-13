// The first-order welcome email — the marketing message someone receives after
// opting in through the WELCOME15 popup.
//
// It is the third message built on lib/email-brand.ts, so it shares the order
// confirmation's shell exactly: cream page, white 600px body, the logo band, a
// sky-blue opening block cut by the pink rule, an editorial section, and the
// black brand footer. What differs is the offer card and the marketing footer
// (unsubscribe + mailing address), because unlike the order confirmation this
// is commercial mail she asked for and can leave.
//
// THE OFFER IS NEVER INVENTED. This module renders only the verified fields it
// is handed by lib/first-order-offer.ts: the discount, the scope, the code, the
// expiry wording, and a disclaimer. It states no eligibility rule, exclusion,
// minimum purchase, or redemption limit of its own, and it never implies
// first-order eligibility — the Stripe coupon is *named* "First order 15% off",
// but no first-time-transaction restriction has been verified, and a coupon
// name is not a rule.
//
// Nothing internal reaches the recipient: no coupon id, no promotion id, no
// redemption count.

import { unsubscribeUrl } from "./unsubscribe";
import type { FirstOrderOffer } from "./first-order-offer";
import {
  BRAND, BUSINESS_ADDRESS, LOGO, RESPONSIVE_STYLE, SUPPORT_EMAIL,
  button, emailUrl, esc, eyebrow, heading, paragraph,
} from "./email-brand";

// Neither the subject nor the preview may imply first-order eligibility: no
// first-time-customer restriction has been verified in Stripe.
export const FIRST_ORDER_SUBJECT = "A little something from Wynn Essentials";

// Derived from the offer rather than hardcoded, so the preview text cannot keep
// naming a code the email no longer carries. For the live WELCOME15 offer this
// renders exactly "Your WELCOME15 offer is inside."
export const firstOrderPreheader = (offer: FirstOrderOffer) => `Your ${offer.code} offer is inside.`;

// The storefront's own campaign photography, already email-safe (JPEG/PNG).
const HERO = {
  src: "/og-basket-espresso.jpg",
  alt: "A Wynn Essentials basket holding Lathyr shampoo, Uplyft conditioner, Hydrate mist, Nourish oil, and Edge Control",
};

const METHOD_STEPS = ["Cleanse", "Condition", "Treat", "Moisturize", "Seal", "Style"] as const;

/**
 * The offer card: the discount, what it applies to, and the code — all live
 * text, so it survives an inbox with images switched off, which is exactly the
 * inbox most likely to be reading a code off a screen.
 */
function offerCard(offer: FirstOrderOffer): string {
  // Only verified facts reach this card: the discount, the scope Stripe's
  // "once" duration licenses, the code, and the absence of a listed expiry.
  // Redemption counts, coupon ids and promotion ids are internal and never
  // appear here or anywhere else a customer can see.
  const expiry = offer.expiration
    ? `<p style="margin:14px 0 0;font-family:${BRAND.sans};font-size:11px;line-height:16px;letter-spacing:.18em;text-transform:uppercase;font-weight:bold;color:${BRAND.muted}">${esc(offer.expiration)}</p>`
    : "";
  const disclaimer = offer.disclaimer
    ? `<p style="margin:14px 0 0;font-family:${BRAND.sans};font-size:12px;line-height:18px;color:${BRAND.muted}">${esc(offer.disclaimer)}</p>`
    : "";

  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background-color:${BRAND.white};border:2px solid ${BRAND.black}">
    <tr>
      <td align="center" style="padding:30px 24px 28px;text-align:center">
        <p style="margin:0;font-family:${BRAND.serif};font-size:52px;line-height:1;letter-spacing:-.02em;color:${BRAND.black}">${esc(offer.label.toUpperCase())}</p>
        <p style="margin:12px 0 0;font-family:${BRAND.sans};font-size:11px;line-height:16px;letter-spacing:.18em;text-transform:uppercase;font-weight:bold;color:${BRAND.muted}">${esc(offer.appliesTo)}</p>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin:22px auto 0">
          <tr>
            <td bgcolor="${BRAND.pink}" style="background-color:${BRAND.pink};padding:14px 26px;text-align:center">
              <span style="font-family:${BRAND.sans};font-size:18px;line-height:22px;font-weight:bold;letter-spacing:.16em;color:${BRAND.black}">CODE: ${esc(offer.code)}</span>
            </td>
          </tr>
        </table>
        ${expiry}
        ${disclaimer}
      </td>
    </tr>
  </table>`;
}

/**
 * Builds the first-order welcome for one subscriber.
 *
 * The only per-recipient value is the signed unsubscribe URL. The popup
 * collects an email address and nothing else, so there is no name to render and
 * no placeholder that can ship empty.
 */
export function firstOrderWelcomeEmail({ email, offer }: { email: string; offer: FirstOrderOffer }): { subject: string; preheader: string; html: string; text: string } {
  const preheader = firstOrderPreheader(offer);
  const shopUrl = emailUrl("/#shop");
  const methodUrl = emailUrl("/#the-wynn-method");
  const optOut = unsubscribeUrl(email);

  const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(FIRST_ORDER_SUBJECT)}</title>
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

        <!-- Welcome header -->
        <tr>
          <td class="px" bgcolor="${BRAND.sky}" style="background-color:${BRAND.sky};padding:34px 34px 38px">
            ${eyebrow("WELCOME TO WYNN ESSENTIALS")}
            ${heading("Welcome in.", 44)}
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px">
              <tr><td width="216" height="9" bgcolor="${BRAND.pink}" style="width:216px;height:9px;background-color:${BRAND.pink};font-size:0;line-height:9px">&nbsp;</td></tr>
            </table>
            ${paragraph(`Thank you for joining us. ${esc(offer.offerLine)}`, "margin-top:24px")}
          </td>
        </tr>

        <!-- Editorial hero -->
        <tr>
          <td bgcolor="${BRAND.sky}" style="background-color:${BRAND.sky};font-size:0;line-height:0">
            <a href="${esc(shopUrl)}" style="text-decoration:none"><img class="fluid" src="${esc(emailUrl(HERO.src))}" width="600" alt="${esc(HERO.alt)}" style="display:block;width:600px;max-width:600px;height:auto;border:0;background-color:${BRAND.cream};font-family:${BRAND.sans};font-size:13px;line-height:20px;color:${BRAND.black};text-align:center"></a>
          </td>
        </tr>

        <!-- Offer card -->
        <tr>
          <td class="px" bgcolor="${BRAND.cream}" style="background-color:${BRAND.cream};padding:36px 34px 34px">
            ${offerCard(offer)}
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin:26px auto 0">
              <tr><td>${button("SHOP THE ESSENTIALS", shopUrl, "center")}</td></tr>
            </table>
          </td>
        </tr>

        <!-- Editorial section -->
        <tr>
          <td class="px" bgcolor="${BRAND.white}" style="background-color:${BRAND.white};padding:40px 34px 36px">
            ${eyebrow("THE WYNN METHOD")}
            <h2 class="h-md" style="margin:14px 0 0;font-family:${BRAND.serif};font-weight:normal;font-size:34px;line-height:1.1;letter-spacing:-.02em;color:${BRAND.black}">Healthy hair is a practice.</h2>
            ${paragraph("Explore intentional essentials for cleansing, conditioning, treating, moisturizing, sealing, and styling textured hair.")}
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0 0">
              ${METHOD_STEPS.map((step, i) => `<tr>
                <td style="padding:0 12px 7px 0;font-family:${BRAND.sans};font-size:11px;line-height:17px;font-weight:bold;letter-spacing:.1em;color:${BRAND.muted}">0${i + 1}</td>
                <td style="padding:0 0 7px;font-family:${BRAND.sans};font-size:12px;line-height:17px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.black}">${step}</td>
              </tr>`).join("")}
            </table>
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 0 0">
              <tr><td>${button("EXPLORE THE WYNN METHOD", methodUrl, "left", BRAND.white, BRAND.black, BRAND.black)}</td></tr>
            </table>
          </td>
        </tr>

        <!-- Closing -->
        <tr>
          <td class="px" align="center" bgcolor="${BRAND.sky}" style="background-color:${BRAND.sky};padding:38px 34px 40px;text-align:center">
            ${paragraph("Good hair information, thoughtful products, and early access are now headed your way.", "margin:0;font-size:17px;line-height:27px")}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td class="px" align="center" bgcolor="${BRAND.black}" style="background-color:${BRAND.black};padding:38px 34px 40px;text-align:center">
            <p style="margin:0;font-family:${BRAND.serif};font-size:28px;line-height:34px;color:${BRAND.white}">Healthy hair is a practice.</p>
            <p style="margin:16px 0 0;font-family:${BRAND.sans};font-size:10px;line-height:16px;letter-spacing:.18em;text-transform:uppercase;color:${BRAND.footerMuted}">BLACK WOMEN-OWNED &middot; LOS ANGELES &middot; EST. 2020</p>
            <p style="margin:20px 0 0;font-family:${BRAND.sans};font-size:12px;line-height:19px;color:${BRAND.footerMuted}">Questions? Just reply to this email &mdash; a real person reads it &mdash; or write to <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND.white}">${SUPPORT_EMAIL}</a>.</p>
            <p style="margin:18px 0 0;font-family:${BRAND.sans};font-size:11px;line-height:18px;color:#8d857a">${esc(BUSINESS_ADDRESS)}</p>
            <p style="margin:8px 0 0;font-family:${BRAND.sans};font-size:11px;line-height:18px;color:#8d857a">You&rsquo;re receiving this because you asked for Wynn Essentials emails at <a href="${esc(emailUrl("/"))}" style="color:#8d857a">wynnessentialsllc.us</a> and ticked the marketing-email box. It never affects your order, shipping, or account emails. <a href="${esc(optOut)}" style="color:${BRAND.white}"><strong>Unsubscribe</strong></a> at any time.</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    "WELCOME TO WYNN ESSENTIALS",
    "",
    "WELCOME IN.",
    "",
    `Thank you for joining us. ${offer.offerLine}`,
    "",
    "----------------------------------------",
    `${offer.label.toUpperCase()} — ${offer.appliesTo}`,
    `CODE: ${offer.code}`,
    ...(offer.expiration ? [offer.expiration] : []),
    ...(offer.disclaimer ? ["", offer.disclaimer] : []),
    "",
    `Shop the essentials: ${shopUrl}`,
    "",
    "----------------------------------------",
    "HEALTHY HAIR IS A PRACTICE.",
    "",
    "Explore intentional essentials for cleansing, conditioning, treating, moisturizing, sealing, and styling textured hair.",
    "",
    METHOD_STEPS.map((s, i) => `0${i + 1} ${s.toUpperCase()}`).join("  ·  "),
    "",
    `Explore The Wynn Method: ${methodUrl}`,
    "",
    "----------------------------------------",
    "Good hair information, thoughtful products, and early access are now headed your way.",
    "",
    "Healthy hair is a practice.",
    "Black women-owned · Los Angeles · Est. 2020",
    "",
    `Questions? Reply to this email — a real person reads it — or write to ${SUPPORT_EMAIL}.`,
    "",
    BUSINESS_ADDRESS,
    "",
    "You're receiving this because you asked for Wynn Essentials emails at wynnessentialsllc.us and ticked the marketing-email box. It never affects your order, shipping, or account emails.",
    `Unsubscribe: ${optOut}`,
    "",
  ].join("\n");

  return { subject: FIRST_ORDER_SUBJECT, preheader, html, text };
}
