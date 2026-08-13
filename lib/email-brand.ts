// Shared foundation for every Wynn Essentials customer email.
//
// Three messages now render from these tokens and helpers — the order
// confirmation, The Wynn Edit welcome, and the first-order welcome — so a brand
// change lands in all of them at once and none can quietly drift from the
// storefront. Values come from app/globals.css.
//
// Email-client constraints these helpers exist to honour:
//   * table-based layout with every style inline, so a client that strips a
//     <style> block still renders the design;
//   * 600px content width, fluid below that;
//   * JPEG/PNG imagery only (WebP and AVIF break in Outlook for Windows),
//     served from absolute production URLs;
//   * live text for anything that matters, so a blocked-image inbox loses
//     nothing but decoration.

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

export const SUPPORT_EMAIL = "wynnessentialsllc@gmail.com";

// Physical mailing address, required in the footer of every commercial email we
// send (CAN-SPAM §7704(a)(5)).
export const BUSINESS_ADDRESS = "Wynn Essentials, LLC · 3680 Wilshire Blvd., Ste P04 A118, Los Angeles, CA 90010";

// The one email-optimised logo, shared by every message: 33KB rather than the
// 263KB storefront original, and a PNG so Outlook renders it.
export const LOGO = { src: "/email/wynn-essentials-logo.png", alt: "Wynn Essentials" };

// The canonical production origin. An email is opened long after it was sent,
// from anywhere, so its images and links must never resolve against a localhost,
// preview, or private origin — an explicitly configured public https origin
// wins, otherwise production does.
const PRODUCTION_ORIGIN = "https://wynnessentialsllc.us";

export function emailOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(configured)) return PRODUCTION_ORIGIN;
  try {
    const { hostname } = new URL(configured);
    // Loopback, mDNS and bare IPs are all developer machines, never a host a
    // subscriber's mail client can reach.
    if (/^(localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(hostname)) return PRODUCTION_ORIGIN;
    if (hostname.endsWith(".local")) return PRODUCTION_ORIGIN;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return PRODUCTION_ORIGIN;
    return configured;
  } catch {
    return PRODUCTION_ORIGIN;
  }
}

/** Absolute, publicly reachable URL for a site asset or page. */
export function emailUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${emailOrigin()}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** HTML-escapes any customer- or Stripe-supplied text before it reaches markup. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Shared HTML building blocks
// ---------------------------------------------------------------------------

export const eyebrow = (text: string, color: string = BRAND.black) =>
  `<p style="margin:0;font-family:${BRAND.sans};font-size:11px;line-height:16px;letter-spacing:.18em;text-transform:uppercase;font-weight:bold;color:${color}">${text}</p>`;

export const heading = (text: string, size: number, color: string = BRAND.black, extra = "") =>
  `<h1 class="h-lg" style="margin:14px 0 0;font-family:${BRAND.serif};font-weight:normal;font-size:${size}px;line-height:1.06;letter-spacing:-.02em;color:${color};mso-line-height-rule:exactly;${extra}">${text}</h1>`;

export const paragraph = (html: string, extra = "") =>
  `<p style="margin:18px 0 0;font-family:${BRAND.sans};font-size:15px;line-height:24px;color:${BRAND.black};${extra}">${html}</p>`;

// A bulletproof-enough button: a single-cell table with generous padding, so the
// tap target clears 44px on a phone and the link still looks like a button in
// clients that drop background colours on <a>.
// `border` matters for an outline button: on a white fill the padding alone
// leaves nothing to see, and the link reads as stray text rather than a button.
export const button = (label: string, url: string, align: "left" | "center" = "left", fill: string = BRAND.black, text: string = BRAND.white, border?: string) => `
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="${align}" style="border-collapse:collapse;${align === "center" ? "margin:0 auto;" : ""}">
    <tr>
      <td bgcolor="${fill}" style="background-color:${fill};${border ? `border:2px solid ${border};` : ""}padding:16px 30px;text-align:center">
        <a href="${esc(url)}" style="display:inline-block;font-family:${BRAND.sans};font-size:12px;line-height:16px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;color:${text};text-decoration:none">${label}</a>
      </td>
    </tr>
  </table>`;

// The mobile-stacking and text-sizing rules every message shares. Progressive
// enhancement only: each rule has an inline desktop equivalent, so a client that
// strips the <style> block still renders the 600px design correctly.
export const RESPONSIVE_STYLE = `
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
    .stack-gap{padding-bottom:24px!important}
    .fluid{width:100%!important;max-width:100%!important;height:auto!important}
  }
  @media only screen and (max-width:400px){
    .px{padding-left:18px!important;padding-right:18px!important}
  }`;
