import crypto from "node:crypto";

const MAX_AGE_SECONDS = 5 * 60;

function secretBytes(secret: string): Buffer {
  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  try { return Buffer.from(encoded, "base64"); } catch { return Buffer.from(encoded); }
}

/** Verify Resend's Standard Webhooks/Svix signature without an extra package. */
export function verifyResendWebhook(payload: string, headers: Headers, now = Date.now()): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET || "";
  const id = headers.get("svix-id") || "";
  const timestamp = headers.get("svix-timestamp") || "";
  const signatures = (headers.get("svix-signature") || "").split(" ");
  const seconds = Number(timestamp);
  if (!secret || !id || !Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > MAX_AGE_SECONDS) return false;

  const expected = crypto.createHmac("sha256", secretBytes(secret))
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");

  return signatures.some(part => {
    const candidate = part.startsWith("v1,") ? part.slice(3) : "";
    if (!candidate || candidate.length !== expected.length) return false;
    try { return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected)); } catch { return false; }
  });
}

