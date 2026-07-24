import { cookies } from "next/headers";

/**
 * Session handling for the fulfillment view.
 *
 * The order tables hold customer email, name, and shipping address, so this
 * gate is the only thing between the public internet and that data. The cookie
 * never contains the shared secret itself: it carries an expiry plus an HMAC
 * of that expiry, so a stolen cookie cannot be turned back into the token and
 * stops working on its own.
 */

const COOKIE = "we_admin";
const TOKEN_ENV = "ADMIN_ORDERS_TOKEN";
const SESSION_HOURS = 12;
const encoder = new TextEncoder();

export function adminTokenConfigured() {
  const token = process.env[TOKEN_ENV];
  return typeof token === "string" && token.length >= 16;
}

function requireToken() {
  const token = process.env[TOKEN_ENV];
  if (!token || token.length < 16) {
    // Refused rather than defaulted: a weak or missing token here would expose
    // customer addresses to anyone who finds the URL.
    throw new Error(`${TOKEN_ENV} must be set to a random value of at least 16 characters.`);
  }
  return token;
}

/** Constant-time comparison, so a wrong guess leaks nothing through timing. */
function safeEqual(a: string, b: string) {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  // Compare lengths without branching out early.
  let mismatch = aBytes.length ^ bBytes.length;
  const max = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < max; i++) mismatch |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  return mismatch === 0;
}

async function sign(message: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(requireToken()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(candidate: unknown) {
  if (typeof candidate !== "string" || !candidate) return false;
  return safeEqual(candidate, requireToken());
}

export async function createSession() {
  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const value = `${expiresAt}.${await sign(String(expiresAt))}`;
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/**
 * True only for a request carrying an unexpired, correctly signed cookie.
 * Every entry point must call this — a server action is its own endpoint and
 * is not protected by the page that renders it.
 */
export async function isAuthenticated() {
  if (!adminTokenConfigured()) return false;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const [expiresAt, signature] = raw.split(".");
  if (!expiresAt || !signature) return false;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Date.now()) return false;
  return safeEqual(signature, await sign(expiresAt));
}
