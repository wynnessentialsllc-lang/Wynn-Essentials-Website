// The post-purchase education email: one message, a section for each product in
// the order, sent once the customer has had it in their hands for a day or two.
//
// It is the fourth message built on lib/email-brand.ts, so it shares the shell
// the order confirmation and the two welcomes use — cream page, white 600px
// body, logo band, sky-blue opening cut by the pink rule, black brand footer.
//
// WHAT THIS MESSAGE IS, AND IS NOT
//
// It is about products she already owns: what each one is, what it does, when
// to reach for it, and how to use it. It sells nothing. There is no offer, no
// discount code, no "you might also like" — a customer who has just paid should
// be able to open the follow-up without being sold to, and the review request
// that comes after it is the only other thing we ask of her.
//
// The one link per product goes to that product's own page, because the label
// is small and the page is where the full directions and ingredients live.
//
// Sections are written in lib/product-education.ts and ordered by The Wynn
// Method, so an order of four products reads as a routine rather than a list.
// "How to use it" is the catalog's own `directions` string, printed verbatim.

import { unsubscribeUrl, canSignUnsubscribe } from "./unsubscribe";
import type { EducationCard } from "./product-education";
import {
  BRAND, BUSINESS_ADDRESS, LOGO, RESPONSIVE_STYLE, SUPPORT_EMAIL,
  button, emailUrl, esc, eyebrow, heading, paragraph,
} from "./email-brand";

export type EducationEmailInput = {
  email: string;
  customerName?: string | null;
  orderReference?: string | null;
  cards: EducationCard[];
};

/** "Hydrate, Nourish, and Lathyr" — the products named in the subject line. */
function nameList(cards: EducationCard[]): string {
  const names = cards.map(c => c.name);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function educationSubject(cards: EducationCard[]): string {
  if (cards.length === 1) return `How to get the most from your ${cards[0].name}`;
  return "How to get the most from your Wynn Essentials";
}

export function educationPreheader(cards: EducationCard[]): string {
  // Names the products so the inbox preview is specific to her order. Long
  // orders would run past what any client shows, so past three it stays short.
  return cards.length <= 3
    ? `What ${nameList(cards)} ${cards.length === 1 ? "is" : "are"} for, and when to reach for ${cards.length === 1 ? "it" : "them"}.`
    : "What everything in your order is for, and when to reach for it.";
}

const label = (text: string) =>
  `<p style="margin:22px 0 0;font-family:${BRAND.sans};font-size:10px;line-height:15px;letter-spacing:.18em;text-transform:uppercase;font-weight:bold;color:${BRAND.muted}">${text}</p>`;

const lead = (html: string) =>
  `<p style="margin:6px 0 0;font-family:${BRAND.sans};font-size:15px;line-height:24px;color:${BRAND.black}">${html}</p>`;

/**
 * One product's section. Live text throughout — the picture is decoration, and
 * an inbox with images switched off loses nothing that matters.
 */
function section(card: EducationCard, index: number): string {
  const { education: e } = card;
  const stripe = index % 2 === 0 ? BRAND.white : BRAND.cream;

  const picture = card.image
    ? `<tr>
        <td align="center" bgcolor="${stripe}" style="background-color:${stripe};padding:30px 34px 0;font-size:0;line-height:0">
          <a href="${esc(card.url)}" style="text-decoration:none"><img class="fluid" src="${esc(emailUrl(card.image.src))}" width="240" alt="${esc(card.image.alt)}" style="display:block;width:240px;max-width:240px;height:auto;border:0"></a>
        </td>
      </tr>`
    : "";

  const scenarios = e.scenarios.map(s => `<tr>
      <td style="padding:0 0 12px">
        <p style="margin:0;font-family:${BRAND.sans};font-size:15px;line-height:23px;color:${BRAND.black}"><strong>${esc(s.when)}</strong></p>
        <p style="margin:2px 0 0;font-family:${BRAND.sans};font-size:15px;line-height:23px;color:${BRAND.muted}">${esc(s.then)}</p>
      </td>
    </tr>`).join("");

  return `${picture}
    <tr>
      <td class="px" bgcolor="${stripe}" style="background-color:${stripe};padding:${card.image ? "22px" : "36px"} 34px 38px">
        ${eyebrow(esc(card.subtitle.toUpperCase()), BRAND.muted)}
        <h2 class="h-md" style="margin:8px 0 0;font-family:${BRAND.serif};font-weight:normal;font-size:34px;line-height:1.08;letter-spacing:-.02em;color:${BRAND.black}">${esc(card.name)}${card.size ? `<span style="font-family:${BRAND.sans};font-size:13px;letter-spacing:.02em;color:${BRAND.muted}"> &nbsp;${esc(card.size)}</span>` : ""}</h2>

        ${label("WHAT IT IS")}
        ${lead(esc(e.whatItIs))}

        ${label("WHAT IT DOES")}
        ${lead(esc(e.whatItDoes))}

        ${label("HOW OFTEN")}
        ${lead(esc(e.rhythm))}

        ${label("WHEN TO REACH FOR IT")}
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 0">${scenarios}</table>

        ${label("HOW TO USE IT")}
        ${lead(esc(card.directions))}

        ${e.pairsWith ? `${label("PAIRS WITH")}${lead(esc(e.pairsWith))}` : ""}
        ${e.goEasy ? `${label("GO EASY")}${lead(esc(e.goEasy))}` : ""}

        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:26px 0 0">
          <tr><td>${button(`ALL ABOUT ${esc(card.name.toUpperCase())}`, card.url, "left", stripe === BRAND.white ? BRAND.white : BRAND.cream, BRAND.black, BRAND.black)}</td></tr>
        </table>
      </td>
    </tr>`;
}

/**
 * Builds the education email for one order.
 *
 * The caller resolves the cards (lib/product-education.ts) and must not call
 * this with an empty list: an order of nothing but products we have no guidance
 * for has no email to send, and the cron skips it rather than sending a shell.
 */
export function productEducationEmail({ email, customerName, orderReference, cards }: EducationEmailInput): { subject: string; preheader: string; html: string; text: string } {
  const subject = educationSubject(cards);
  const preheader = educationPreheader(cards);
  const firstName = (customerName ?? "").trim().split(/\s+/)[0] || "there";
  const methodUrl = emailUrl("/#the-wynn-method");
  // Never render a dead opt-out: without a signing secret the link cannot be
  // verified, so the line is left out entirely rather than pointing at a page
  // that would refuse her. This message is about a purchase she made, and the
  // mailing address below stays either way.
  const optOut = canSignUnsubscribe() ? unsubscribeUrl(email) : null;

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
            ${eyebrow("YOUR ORDER, EXPLAINED")}
            ${heading("Now let&rsquo;s put it to work.", 42)}
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px">
              <tr><td width="216" height="9" bgcolor="${BRAND.pink}" style="width:216px;height:9px;background-color:${BRAND.pink};font-size:0;line-height:9px">&nbsp;</td></tr>
            </table>
            ${paragraph(`Hi ${esc(firstName)} &mdash; your order should be with you by now. Here is what you bought, what each one is actually for, and the moments to reach for it. Nothing to buy in this email.`, "margin-top:24px")}
            ${orderReference ? `<p style="margin:16px 0 0;font-family:${BRAND.sans};font-size:12px;line-height:19px;color:${BRAND.black}">Order reference: <strong>${esc(orderReference)}</strong></p>` : ""}
          </td>
        </tr>

        ${cards.map(section).join("")}

        <!-- Closing -->
        <tr>
          <td class="px" bgcolor="${BRAND.sky}" style="background-color:${BRAND.sky};padding:38px 34px 40px">
            ${eyebrow("THE WYNN METHOD")}
            <h2 class="h-md" style="margin:12px 0 0;font-family:${BRAND.serif};font-weight:normal;font-size:30px;line-height:1.1;letter-spacing:-.02em;color:${BRAND.black}">Cleanse. Condition. Treat.<br>Moisturize. Seal. Style.</h2>
            ${paragraph("Six steps, in that order. You do not need all six every week &mdash; you need to know which one you are doing, and why.")}
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 0 0">
              <tr><td>${button("SEE THE FULL METHOD", methodUrl, "left")}</td></tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td class="px" align="center" bgcolor="${BRAND.black}" style="background-color:${BRAND.black};padding:38px 34px 40px;text-align:center">
            <p style="margin:0;font-family:${BRAND.serif};font-size:28px;line-height:34px;color:${BRAND.white}">Healthy hair is a practice.</p>
            <p style="margin:16px 0 0;font-family:${BRAND.sans};font-size:10px;line-height:16px;letter-spacing:.18em;text-transform:uppercase;color:${BRAND.footerMuted}">BLACK WOMEN-OWNED &middot; LOS ANGELES &middot; EST. 2020</p>
            <p style="margin:20px 0 0;font-family:${BRAND.sans};font-size:12px;line-height:19px;color:${BRAND.footerMuted}">Not sure how something fits your hair? Reply to this email &mdash; a real person reads it &mdash; or write to <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND.white}">${SUPPORT_EMAIL}</a>.</p>
            <p style="margin:18px 0 0;font-family:${BRAND.sans};font-size:11px;line-height:18px;color:#8d857a">${esc(BUSINESS_ADDRESS)}</p>
            <p style="margin:8px 0 0;font-family:${BRAND.sans};font-size:11px;line-height:18px;color:#8d857a">You&rsquo;re getting this because you bought these products from Wynn Essentials, and it is sent once per order.${optOut ? ` If you&rsquo;d rather not hear from us again, <a href="${esc(optOut)}" style="color:${BRAND.white}"><strong>unsubscribe</strong></a> &mdash; your order and shipping emails are unaffected.` : ""}</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    "YOUR ORDER, EXPLAINED",
    "",
    "NOW LET'S PUT IT TO WORK.",
    "",
    `Hi ${firstName} — your order should be with you by now. Here is what you bought, what each one is actually for, and the moments to reach for it. Nothing to buy in this email.`,
    ...(orderReference ? ["", `Order reference: ${orderReference}`] : []),
    ...cards.flatMap(card => [
      "",
      "----------------------------------------",
      `${card.name.toUpperCase()} — ${card.subtitle}${card.size ? ` (${card.size})` : ""}`,
      "",
      `WHAT IT IS: ${card.education.whatItIs}`,
      "",
      `WHAT IT DOES: ${card.education.whatItDoes}`,
      "",
      `HOW OFTEN: ${card.education.rhythm}`,
      "",
      "WHEN TO REACH FOR IT:",
      ...card.education.scenarios.map(s => `  · ${s.when} — ${s.then}`),
      "",
      `HOW TO USE IT: ${card.directions}`,
      ...(card.education.pairsWith ? ["", `PAIRS WITH: ${card.education.pairsWith}`] : []),
      ...(card.education.goEasy ? ["", `GO EASY: ${card.education.goEasy}`] : []),
      "",
      `All about ${card.name}: ${card.url}`,
    ]),
    "",
    "----------------------------------------",
    "THE WYNN METHOD",
    "Cleanse. Condition. Treat. Moisturize. Seal. Style.",
    "",
    "Six steps, in that order. You do not need all six every week — you need to know which one you are doing, and why.",
    "",
    `See the full method: ${methodUrl}`,
    "",
    "----------------------------------------",
    "Healthy hair is a practice.",
    "Black women-owned · Los Angeles · Est. 2020",
    "",
    `Not sure how something fits your hair? Reply to this email — a real person reads it — or write to ${SUPPORT_EMAIL}.`,
    "",
    BUSINESS_ADDRESS,
    "",
    `You're getting this because you bought these products from Wynn Essentials, and it is sent once per order.${optOut ? " Your order and shipping emails are unaffected if you unsubscribe." : ""}`,
    ...(optOut ? [`Unsubscribe: ${optOut}`] : []),
    "",
  ].join("\n");

  return { subject, preheader, html, text };
}
