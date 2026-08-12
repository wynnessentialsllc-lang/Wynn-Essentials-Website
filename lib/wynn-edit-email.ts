// The Wynn Edit welcome email — the marketing message a subscriber receives
// once, after she affirmatively opts in to the newsletter.
//
// This module only COMPOSES the email. Nothing here decides whether a send is
// allowed: consent, suppression and send-once are settled in
// app/api/subscribe/route.ts before notifyWynnEditWelcome() (lib/notify.ts) is
// ever called.
//
// Email-safe constraints this file honours deliberately:
//   * tables for layout, inline styles on every element that matters — the
//     <style> block only adds mobile stacking, which is a progressive
//     enhancement, never a requirement for the design to read;
//   * 600px desktop body, fluid below that;
//   * every headline, benefit, CTA label and legal line is LIVE TEXT, so the
//     email is complete with images blocked;
//   * three images, all real Wynn Essentials photography already in public/,
//     all absolute https URLs on the production origin, all with alt text;
//   * a plain-text alternative that carries the same copy and the same links.
//
// The masthead uses public/email/wynn-essentials-logo.png — the same
// email-optimised asset the order-confirmation email uses (33KB rather than the
// 263KB storefront original), so the two messages share one mark.
//
// `emailOrigin()` below is deliberately a separate, slightly stricter copy of
// the one in lib/order-confirmation-email.ts: it also refuses bare IPs and
// .local hosts. Both belong in a shared lib/email-brand.ts eventually, together
// with the BRAND tokens — a tidy-up worth doing on its own, not folded into
// this change.

import { unsubscribeUrl } from "./unsubscribe";

// Production origin for links and image sources. NEXT_PUBLIC_SITE_URL is only
// trusted when it is a real https origin: it is "http://localhost:3000" in
// development, and a localhost image in a delivered email is a broken image.
const PRODUCTION_ORIGIN = "https://wynnessentialsllc.us";
export function emailOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  if (!configured.startsWith("https://")) return PRODUCTION_ORIGIN;
  try {
    const { hostname } = new URL(configured);
    if (hostname === "localhost" || hostname.endsWith(".local") || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return PRODUCTION_ORIGIN;
    return configured;
  } catch {
    return PRODUCTION_ORIGIN;
  }
}

export const WYNN_EDIT_SUBJECT = "You’re officially on The Wynn Edit list";
export const WYNN_EDIT_PREHEADER = "Good hair information is coming to your inbox.";

// Physical mailing address required on commercial email (CAN-SPAM §7704(a)(5)).
const BUSINESS_ADDRESS = "Wynn Essentials, LLC · 3680 Wilshire Blvd., Ste P04 A118, Los Angeles, CA 90010";
const REPLY_ADDRESS = "wynnessentialsllc@gmail.com";

// Palette lifted from app/globals.css so the email and the storefront stay one
// brand: kraft golds, the campaign sky blue, the campaign pink, and the warm
// terracotta from the editorial product photography.
const C = {
  ink: "#171513",
  body: "#4a443c",
  muted: "#7a7168",
  page: "#efe7db",
  card: "#fffdf8",
  panel: "#f7f2ea",
  rule: "#e3d9c9",
  gold: "#b39067",
  goldDeep: "#846743",
  sky: "#50aee7",
  pink: "#ff65a8",
  orange: "#c85a2c",
};

const SERIF = "Georgia,'Times New Roman',Times,serif";
const SANS = "Arial,Helvetica,sans-serif";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BENEFITS = [
  { n: "01", accent: C.gold, label: "ROUTINE GUIDANCE", copy: "Simple ways to build a hair-care practice you can actually maintain." },
  { n: "02", accent: C.sky, label: "INGREDIENT EDUCATION", copy: "Clear explanations of what ingredients do and how they may fit your routine." },
  { n: "03", accent: C.pink, label: "PRODUCT RELEASES", copy: "First looks at new Wynn Essentials products, collections, and restocks." },
  { n: "04", accent: C.orange, label: "EARLY ACCESS", copy: "Subscriber-first access to select launches and special announcements." },
] as const;

// The six steps of The Wynn Method, in routine order. Rendered as live text so
// the featured section still teaches something with images turned off.
const METHOD_STEPS = ["Cleanse", "Condition", "Treat", "Moisturize", "Seal", "Style"] as const;

const eyebrow = (text: string, color = C.goldDeep) =>
  `<p style="margin:0;font-family:${SANS};font-size:11px;line-height:1.4;letter-spacing:0.22em;text-transform:uppercase;font-weight:bold;color:${color}">${text}</p>`;

const rule = (color = C.rule) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;line-height:1px;font-size:0;background-color:${color}">&nbsp;</td></tr></table>`;

function button({ href, label, fill, text, border }: { href: string; label: string; fill: string; text: string; border?: string }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
    <tr>
      <td align="center" bgcolor="${fill}" style="background-color:${fill};border:2px solid ${border ?? fill};padding:16px 28px">
        <a href="${href}" style="display:inline-block;font-family:${SANS};font-size:12px;line-height:1;font-weight:bold;letter-spacing:0.18em;text-transform:uppercase;color:${text};text-decoration:none">${label}</a>
      </td>
    </tr>
  </table>`;
}

function benefitCard({ n, accent, label, copy }: (typeof BENEFITS)[number]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.card};border:1px solid ${C.rule};border-top:3px solid ${accent}">
    <tr>
      <td style="padding:22px 20px 24px">
        <p style="margin:0 0 10px;font-family:${SERIF};font-size:26px;line-height:1;color:${accent}">${n}</p>
        <p style="margin:0 0 8px;font-family:${SANS};font-size:11px;line-height:1.4;letter-spacing:0.16em;font-weight:bold;color:${C.ink}">${label}</p>
        <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.65;color:${C.body}">${copy}</p>
      </td>
    </tr>
  </table>`;
}

function benefitRow(left: (typeof BENEFITS)[number], right: (typeof BENEFITS)[number]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td class="stack" width="250" valign="top" style="width:250px">${benefitCard(left)}</td>
      <td class="gutter" width="20" style="width:20px;font-size:0;line-height:0">&nbsp;</td>
      <td class="stack" width="250" valign="top" style="width:250px">${benefitCard(right)}</td>
    </tr>
  </table>`;
}

/**
 * Builds the complete Wynn Edit welcome email for one subscriber.
 *
 * The only per-recipient value is the signed unsubscribe URL — the copy carries
 * no name, because the signup form collects only an email address. There is no
 * "Hi {first name}" to degrade into "Hi there" and no placeholder that can ship
 * empty.
 */
export function wynnEditWelcomeEmail({ email }: { email: string }): { subject: string; preheader: string; html: string; text: string } {
  const origin = emailOrigin();
  const methodUrl = `${origin}/#the-wynn-method`;
  const shopUrl = `${origin}/#shop`;
  const insightsUrl = `${origin}/blog`;
  const optOut = escapeHtml(unsubscribeUrl(email));
  const img = (path: string) => `${origin}${path}`;

  const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(WYNN_EDIT_SUBJECT)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  /* Progressive enhancement only. Every block below is already readable at
     600px in a client that ignores this block entirely. */
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}
  a{color:${C.goldDeep}}
  @media only screen and (max-width:620px){
    .wrap{width:100% !important}
    .pad{padding-left:24px !important;padding-right:24px !important}
    .stack{display:block !important;width:100% !important;max-width:100% !important;box-sizing:border-box !important}
    /* The column gutter becomes the gap BETWEEN the stacked cards. */
    .gutter{display:block !important;width:100% !important;height:16px !important;line-height:16px !important}
    .gap{display:block !important;height:16px !important;line-height:16px !important;font-size:0 !important}
    .h1{font-size:38px !important;line-height:1.05 !important}
    .h2{font-size:27px !important}
    .feature-img{width:100% !important;height:auto !important;max-width:280px !important}
    .btn a{font-size:11px !important;letter-spacing:0.14em !important}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.page};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${C.page}">${escapeHtml(WYNN_EDIT_PREHEADER)}&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.page}">
  <tr>
    <td align="center" style="padding:24px 12px 40px">

      <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:${C.card}">

        <!-- Masthead -->
        <tr>
          <td align="center" class="pad" style="padding:34px 40px 26px;background-color:${C.card}">
            <a href="${origin}" style="text-decoration:none"><img src="${img("/email/wynn-essentials-logo.png")}" width="140" height="118" alt="Wynn Essentials" style="display:block;width:140px;height:118px;margin:0 auto;border:0;font-family:${SERIF};font-size:20px;color:${C.ink};text-align:center"></a>
          </td>
        </tr>
        <tr><td style="padding:0 0 0">${rule(C.gold)}</td></tr>

        <!-- Hero -->
        <tr>
          <td style="font-size:0;line-height:0">
            <a href="${shopUrl}" style="text-decoration:none"><img src="${img("/og-basket-espresso.jpg")}" width="600" height="315" alt="A Wynn Essentials basket holding Lathyr shampoo, Uplyft conditioner, Hydrate mist, Nourish oil, and Edge Control — healthy hair is a practice." style="display:block;width:100%;max-width:600px;height:auto;border:0;background-color:${C.panel};font-family:${SANS};font-size:13px;line-height:1.6;color:${C.body};text-align:center"></a>
          </td>
        </tr>

        <!-- Opening -->
        <tr>
          <td class="pad" style="padding:40px 40px 8px;background-color:${C.card}">
            ${eyebrow("The Wynn Edit")}
            <h1 class="h1" style="margin:14px 0 0;font-family:${SERIF};font-size:46px;line-height:1.02;font-weight:normal;letter-spacing:-0.02em;color:${C.ink}">You’re on the list.</h1>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:20px 40px 0;background-color:${C.card}">
            <p style="margin:0 0 16px;font-family:${SERIF};font-size:19px;line-height:1.6;color:${C.ink}">Welcome to The Wynn Edit, where good hair information meets intentional care.</p>
            <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.75;color:${C.body}">You’ll receive routine guidance, ingredient education, product releases, early access, and thoughtful information created to help you care for your hair with more clarity and less guesswork.</p>
          </td>
        </tr>
        <tr><td class="pad" style="padding:34px 40px 0">${rule()}</td></tr>

        <!-- Benefits -->
        <tr>
          <td class="pad" style="padding:34px 40px 0;background-color:${C.card}">
            ${eyebrow("What to expect", C.gold)}
            <h2 class="h2" style="margin:12px 0 26px;font-family:${SERIF};font-size:32px;line-height:1.15;font-weight:normal;letter-spacing:-0.015em;color:${C.ink}">Here’s what belongs in your inbox.</h2>
            ${benefitRow(BENEFITS[0], BENEFITS[1])}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="gap" style="height:20px;line-height:20px;font-size:0">&nbsp;</td></tr></table>
            ${benefitRow(BENEFITS[2], BENEFITS[3])}
          </td>
        </tr>

        <!-- Featured: The Wynn Method -->
        <tr>
          <td class="pad" style="padding:40px 40px 0;background-color:${C.card}">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.panel};border:1px solid ${C.rule}">
              <tr>
                <td class="stack" width="240" valign="top" style="width:240px;font-size:0;line-height:0">
                  <a href="${methodUrl}" style="text-decoration:none"><img class="feature-img" src="${img("/campaign-cared-for.jpeg")}" width="240" height="393" alt="A Wynn Essentials model with long, glossy, cared-for hair styled around the Nourish Organic Oil Blend" style="display:block;width:240px;height:auto;border:0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.body}"></a>
                </td>
                <td class="stack" valign="middle" style="padding:28px 26px">
                  ${eyebrow("Start with The Wynn Method", C.goldDeep)}
                  <p style="margin:14px 0 0;font-family:${SERIF};font-size:17px;line-height:1.65;color:${C.ink}">Healthy hair is not one perfect wash day. It is a practice built through cleansing, conditioning, treating, moisturizing, sealing, and styling with intention.</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0">
                    ${METHOD_STEPS.map((step, i) => `<tr>
                      <td style="padding:0 10px 6px 0;font-family:${SANS};font-size:11px;line-height:1.5;font-weight:bold;letter-spacing:0.1em;color:${C.gold}">0${i + 1}</td>
                      <td style="padding:0 0 6px;font-family:${SANS};font-size:12px;line-height:1.5;letter-spacing:0.14em;text-transform:uppercase;color:${C.body}">${step}</td>
                    </tr>`).join("")}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Calls to action -->
        <tr>
          <td align="center" class="pad btn" style="padding:30px 40px 0;background-color:${C.card}">
            ${button({ href: methodUrl, label: "Explore The Wynn Method", fill: C.gold, text: "#ffffff" })}
          </td>
        </tr>
        <tr>
          <td align="center" class="pad btn" style="padding:14px 40px 0;background-color:${C.card}">
            ${button({ href: shopUrl, label: "Shop the Essentials", fill: C.card, text: C.ink, border: C.ink })}
          </td>
        </tr>

        <!-- Closing -->
        <tr><td class="pad" style="padding:38px 40px 0">${rule()}</td></tr>
        <tr>
          <td align="center" class="pad" style="padding:34px 40px 40px;background-color:${C.card}">
            <h2 class="h2" style="margin:0;font-family:${SERIF};font-size:30px;line-height:1.2;font-weight:normal;letter-spacing:-0.015em;color:${C.ink}">Good hair information starts here.</h2>
            <p style="margin:14px 0 0;font-family:${SANS};font-size:15px;line-height:1.7;color:${C.body}">We’re glad you’re here.</p>
            <p style="margin:18px 0 0;font-family:${SERIF};font-size:17px;line-height:1.5;color:${C.goldDeep}">The Wynn Essentials Team</p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td class="pad" style="padding:26px 40px 34px;background-color:${C.panel};border-top:1px solid ${C.rule}">
            <p style="margin:0 0 14px;font-family:${SERIF};font-size:20px;line-height:1.3;color:${C.ink}">Healthy hair is a practice.</p>
            <p style="margin:0 0 14px;font-family:${SANS};font-size:12px;line-height:1.7;color:${C.muted}">
              Questions, or want to tell us about your routine? Just reply to this email — a real person reads it — or write to
              <a href="mailto:${REPLY_ADDRESS}" style="color:${C.goldDeep}">${REPLY_ADDRESS}</a>.
            </p>
            <p style="margin:0 0 14px;font-family:${SANS};font-size:12px;line-height:1.7;color:${C.muted}">
              <a href="${shopUrl}" style="color:${C.goldDeep};text-decoration:underline">Shop</a> &nbsp;·&nbsp;
              <a href="${methodUrl}" style="color:${C.goldDeep};text-decoration:underline">The Wynn Method</a> &nbsp;·&nbsp;
              <a href="${insightsUrl}" style="color:${C.goldDeep};text-decoration:underline">Insights</a>
            </p>
            <p style="margin:0 0 10px;font-family:${SANS};font-size:11px;line-height:1.7;color:${C.muted}">${escapeHtml(BUSINESS_ADDRESS)}</p>
            <p style="margin:0;font-family:${SANS};font-size:11px;line-height:1.7;color:${C.muted}">
              You’re receiving The Wynn Edit because you asked for it at
              <a href="${origin}" style="color:${C.goldDeep};text-decoration:underline">wynnessentialsllc.us</a>
              and ticked the marketing-email box. It never affects your order, shipping, or account emails.
              <a href="${optOut}" style="color:${C.goldDeep};text-decoration:underline"><strong>Unsubscribe</strong></a> at any time.
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    "THE WYNN EDIT",
    "",
    "YOU’RE ON THE LIST.",
    "",
    "Welcome to The Wynn Edit, where good hair information meets intentional care.",
    "",
    "You’ll receive routine guidance, ingredient education, product releases, early access, and thoughtful information created to help you care for your hair with more clarity and less guesswork.",
    "",
    "----------------------------------------",
    "HERE’S WHAT BELONGS IN YOUR INBOX.",
    "",
    ...BENEFITS.flatMap(b => [`${b.n}. ${b.label}`, `    ${b.copy}`, ""]),
    "----------------------------------------",
    "START WITH THE WYNN METHOD",
    "",
    "Healthy hair is not one perfect wash day. It is a practice built through cleansing, conditioning, treating, moisturizing, sealing, and styling with intention.",
    "",
    METHOD_STEPS.map((s, i) => `0${i + 1} ${s.toUpperCase()}`).join("  ·  "),
    "",
    `Explore The Wynn Method: ${methodUrl}`,
    `Shop the Essentials: ${shopUrl}`,
    "",
    "----------------------------------------",
    "GOOD HAIR INFORMATION STARTS HERE.",
    "",
    "We’re glad you’re here.",
    "",
    "The Wynn Essentials Team",
    "",
    "----------------------------------------",
    "Healthy hair is a practice.",
    "",
    `Questions? Reply to this email — a real person reads it — or write to ${REPLY_ADDRESS}.`,
    "",
    BUSINESS_ADDRESS,
    "",
    "You’re receiving The Wynn Edit because you asked for it at wynnessentialsllc.us and ticked the marketing-email box. It never affects your order, shipping, or account emails.",
    `Unsubscribe: ${unsubscribeUrl(email)}`,
    "",
  ].join("\n");

  return { subject: WYNN_EDIT_SUBJECT, preheader: WYNN_EDIT_PREHEADER, html, text };
}
