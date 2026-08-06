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

// Header that lets Gmail/Apple Mail show a native "Unsubscribe" affordance.
export function listUnsubscribeHeaders(email: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(email)}>, <mailto:wynnessentialsllc@gmail.com?subject=Unsubscribe>`,
  };
}
