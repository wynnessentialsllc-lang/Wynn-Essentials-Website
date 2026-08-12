import crypto from "node:crypto";

// Signs and verifies one-per-email unsubscribe links for marketing email
// (CAN-SPAM). The token is an HMAC of the lowercased email, so links can't be
// forged and no per-subscriber token needs storing. Prefers a dedicated secret
// but falls back to other server-only secrets already set in production, so the
// links work without adding new configuration. Never runs on the client.
function secret(): string {
  return (
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.CRON_SECRET ||
    process.env.STRIPE_WEBHOOK_SECRET ||
    ""
  );
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://wynnessentialsllc.us").replace(/\/+$/, "");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Whether a signing secret is configured at all. Without one no unsubscribe
 * link can be signed, so no marketing email may be sent — an opt-out that does
 * not work is worse than no send (CAN-SPAM §7704(a)(3)). Marketing senders
 * check this before composing.
 */
export function canSignUnsubscribe(): boolean {
  return secret().length > 0;
}

export function unsubscribeToken(email: string): string {
  const key = secret();
  if (!key) return "";
  return crypto.createHmac("sha256", key).update(normalizeEmail(email)).digest("hex").slice(0, 32);
}

export function verifyUnsubscribe(email: string, token: string): boolean {
  const expected = unsubscribeToken(email);
  if (!expected || !token || expected.length !== token.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

export function unsubscribeUrl(email: string): string {
  const e = encodeURIComponent(normalizeEmail(email));
  return `${siteUrl()}/unsubscribe?e=${e}&t=${unsubscribeToken(email)}`;
}

// Headers that let Gmail/Apple Mail show a native "Unsubscribe" affordance.
//
// `oneClick` adds the RFC 8058 pairing: the mailbox provider POSTs
// "List-Unsubscribe=One-Click" to the HTTPS URL and expects a 2xx, with no
// confirmation step. /api/unsubscribe honours that shape (reading e/t from the
// query string) and still shows the confirm-then-POST page to humans. Only set
// it on true bulk marketing mail — one-click on a transactional message would
// let a mailbox scanner opt someone out of nothing.
export function listUnsubscribeHeaders(email: string, opts: { oneClick?: boolean } = {}): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(email)}>, <mailto:wynnessentialsllc@gmail.com?subject=Unsubscribe>`,
    ...(opts.oneClick ? { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {}),
  };
}
