// Shop by CrownPrint™ — server-only integration seam with Hair Wellness Lab.
//
// ARCHITECTURE
// Hair Wellness Lab (HWL) remains the source of truth for the CrownPrint Core,
// CrownState, CrownHistory, the CrownPrint assessment, its Intelligence Report,
// the scientific/evidence architecture, and the Wynn Essentials Match™
// deterministic intelligence. This file NEVER reimplements any of that. It is a
// thin, safe adapter. See docs/wynn-essentials-integration.md for the contract.
//
// THE APPROVED PROTOCOL (do not deviate)
//  1. Wynn sends the shopper to an HWL flow (connect / create / refresh) with only
//     a validated `return` URL — never CrownPrint data in query parameters.
//  2. HWL authenticates the user, (re)verifies/updates the CrownPrint, mints an
//     OPAQUE ONE-TIME connect code (~256-bit, ~2-min TTL, audience-bound to Wynn,
//     stored HWL-side only as a keyed hash, atomically redeemed once, replay
//     rejected), and redirects back to the Wynn return URL carrying ONLY that code.
//  3. Wynn's server exchanges the code EXACTLY ONCE via an HMAC-signed
//     server-to-server POST to /api/integrations/wynn-essentials/match. HWL
//     atomically redeems the code and returns a safe WynnMatchContext.
//  4. The code is dead after that single exchange. Wynn discards it and keeps only
//     a minimal, server-side Wynn session (see lib session helpers) to render the
//     experience. Wynn NEVER re-exchanges the HWL code and NEVER treats it as a
//     reusable API credential.
//
// SECURITY
// - The HMAC secret (WYNN_INTEGRATION_HMAC_SECRET) is a server-only env var, never
//   sent to the browser. There is NO Bearer service token in this contract.
// - Wynn never possesses HWL's connect-code secret (WYNN_CONNECT_TOKEN_SECRET is
//   HWL-only). Wynn cannot mint or verify connect codes itself.
// - normalizeMatchContext() whitelists ONLY the approved safe fields at the
//   boundary, so raw CrownPrint answers, axis values, CrownState/CrownHistory
//   detail, report content, user UUIDs, raw scores, weights, thresholds, reason
//   codes, and evidence logic can never enter Wynn even if HWL sends them.
//
// NO FABRICATION
// This adapter NEVER invents match data. When HWL is unconfigured, a code is
// missing/expired/replayed, or a call fails, the experience shows an explicit
// state (integration-unavailable / temporarily-unavailable / no-CrownPrint) —
// never fake matches. Supplying the env below activates the live integration with
// no UI changes.

import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { commerceConfig } from "./commerce-config";

// ---------------------------------------------------------------------------
// Approved safe contract (WynnMatchContext). These are the ONLY fields Wynn ever
// stores or renders. Nothing here can express a score, weight, threshold, axis,
// reason code, user id, or any raw CrownPrint / CrownState / CrownHistory detail.
// ---------------------------------------------------------------------------

export type MatchClass = "strong" | "good" | "conditional";

export type SafeMatchProduct = {
  productKey: string;   // maps to a Product.slug in app/data.ts (catalog = truth)
  productName: string;  // convenience label from HWL; catalog name is authoritative
  matchClass: MatchClass;
  why: string;          // consumer-safe explanation of FIT (not a new efficacy claim)
};

// Consumer-safe, educational "what to look for" guidance for the no-strong-match
// outcome. Contains no proprietary scoring — just shopper-facing direction.
export type WhatToLookFor = {
  hairNeed?: string;
  productType?: string;
  formulationCharacteristics: string[];
  ingredientFunctions: string[];
  whatMayNotFit: string[];
  whyThisMatters?: string;
};

// Safe, allow-listed HWL links (e.g. the Product Hub). URLs only, no data.
export type SafeLinks = { productHub?: string; assessment?: string; crownstateUpdate?: string };

export type WynnMatchContext = {
  crownPrintPresent: boolean;                 // CrownPrint exists / missing
  crownState: { present: boolean; fresh: boolean; message?: string }; // fresh / stale / message
  currentPriorityLabel?: string;              // consumer-safe priority label
  matches: SafeMatchProduct[];                // product keys + class + why
  noStrongMatch: boolean;                     // intentional no-strong-match outcome
  whatToLookFor?: WhatToLookFor;              // guidance for the no-match outcome
  safeLinks?: SafeLinks;                       // safe HWL links
  ruleVersion?: string;                        // HWL rule/version stamp (safe)
  generatedAt?: string;                        // when HWL produced this (safe)
};

// Result of the one-time exchange. `reason` drives which explicit state renders.
export type ExchangeResult =
  | { ok: true; context: WynnMatchContext }
  | { ok: false; reason: "expired" | "unavailable" | "error" };

// ---------------------------------------------------------------------------
// Configuration (all server-only). NO Bearer token. NO HWL connect-code secret.
// ---------------------------------------------------------------------------

export const crownprintConfig = {
  apiBaseUrl: process.env.HWL_API_BASE_URL || null,                 // server-to-server base
  hmacSecret: process.env.WYNN_INTEGRATION_HMAC_SECRET || null,     // signs the exchange
  assessmentUrl: process.env.HWL_ASSESSMENT_URL || null,           // create CrownPrint (paid)
  crownstateUpdateUrl: process.env.HWL_CROWNSTATE_UPDATE_URL || null, // refresh CrownState
  productHubUrl: process.env.HWL_PRODUCT_HUB_URL || null,           // no-strong-match CTA
  // Display-only price shown on the create CTA. HWL charges it, Wynn never does.
  createPriceLabel: process.env.HWL_CROWNPRINT_PRICE || "$9.99",
  // Wynn-LOCAL secret used only to sign Wynn's own session/CSRF cookies. It is
  // never the HWL connect-code secret and is never shared with HWL.
  sessionSecret: process.env.WYNN_SESSION_SECRET || process.env.ADMIN_ORDERS_TOKEN || null,
};

// Fixed contract endpoints implemented by Hair Wellness Lab.
const MATCH_PATH = "/api/integrations/wynn-essentials/match";
const CONNECT_PATH = "/crownprint/connect";

// Wynn's own two routes. They are deliberately DIFFERENT paths:
//   START_PATH  — Wynn-initiated outbound hop (the CTAs point here)
//   RETURN_PATH — the HWL callback, and the only value ever sent as `return`
// Collapsing them into one route makes the callback URL also an outbound
// trigger, so anything HWL echoes back can bounce the shopper straight out
// again (or straight back to the landing page). Keep them separate.
export const START_PATH = "/shop-by-crownprint/start";
const RETURN_PATH = "/shop-by-crownprint/connect";

// True when the safe-match exchange can be signed and sent.
export function crownprintApiConfigured() {
  return Boolean(crownprintConfig.apiBaseUrl && crownprintConfig.hmacSecret);
}

// True when the whole round-trip can work (send to HWL, exchange, store a Wynn
// session). When false the experience shows an explicit integration-unavailable
// state — never fabricated results, never a dead CTA.
export function crownprintIntegrationReady() {
  return crownprintApiConfigured() && Boolean(crownprintConfig.assessmentUrl) && Boolean(crownprintConfig.sessionSecret);
}

// ---------------------------------------------------------------------------
// HMAC helpers.
// ---------------------------------------------------------------------------
const encoder = new TextEncoder();

async function hmac(secret: string, message: string, encoding: "hex" | "b64url"): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  if (encoding === "hex") return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// The exact request signature HWL verifies: HMAC-SHA256 over "<timestamp>.<rawBody>".
export function signExchange(timestamp: string, rawBody: string): Promise<string> {
  if (!crownprintConfig.hmacSecret) throw new Error("WYNN_INTEGRATION_HMAC_SECRET is not configured.");
  return hmac(crownprintConfig.hmacSecret, `${timestamp}.${rawBody}`, "hex");
}

// Constant-time compare for cookie signatures.
function safeEqual(a: string, b: string) {
  const ab = encoder.encode(a), bb = encoder.encode(b);
  let mismatch = ab.length ^ bb.length;
  const max = Math.max(ab.length, bb.length);
  for (let i = 0; i < max; i++) mismatch |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return mismatch === 0;
}

function b64url(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// THE ONE-TIME EXCHANGE. Called EXACTLY ONCE per connect code, server-side only.
// The code is used here and then discarded by the caller — never stored as a
// reusable credential, never re-exchanged on subsequent views.
// ---------------------------------------------------------------------------
export async function exchangeConnectCode(code: string, returnUrl: string): Promise<ExchangeResult> {
  if (!crownprintApiConfigured()) return { ok: false, reason: "unavailable" };
  // Body is signed verbatim; keep it stable so the signature matches on the wire.
  const rawBody = JSON.stringify({ code, return: returnUrl });
  const timestamp = String(Date.now());
  let signature: string;
  try {
    signature = await signExchange(timestamp, rawBody);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${crownprintConfig.apiBaseUrl}${MATCH_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Exact header names implemented by Hair Wellness Lab. No Bearer token.
        "X-Wynn-Timestamp": timestamp,
        "X-Wynn-Signature": signature,
      },
      body: rawBody,
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (res.status === 200) return { ok: true, context: normalizeMatchContext(await res.json()) };
    // 404/409/410 → code unknown / already redeemed (replay) / expired.
    if (res.status === 404 || res.status === 409 || res.status === 410) return { ok: false, reason: "expired" };
    // 503 → HWL temporarily unavailable (distinct from "no CrownPrint").
    if (res.status === 503) return { ok: false, reason: "unavailable" };
    return { ok: false, reason: "error" };
  } catch {
    // Network error / timeout → temporarily unavailable, never fabricated.
    return { ok: false, reason: "unavailable" };
  }
}

// ---------------------------------------------------------------------------
// Boundary normalization: accept ONLY approved safe fields. Everything else on
// the wire (userUuid, scores, weights, thresholds, axis values, reasonCodes,
// crownState/crownHistory detail, report content, evidence logic) is dropped.
// ---------------------------------------------------------------------------
const str = (v: unknown, max = 600): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
const list = (v: unknown, maxItems = 8, maxLen = 200): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter((x): x is string => Boolean(x)).slice(0, maxItems) : [];
const asClass = (v: unknown): MatchClass | null =>
  v === "strong" || v === "good" || v === "conditional" ? v : null;

export function normalizeMatchContext(input: unknown): WynnMatchContext {
  const empty: WynnMatchContext = { crownPrintPresent: false, crownState: { present: false, fresh: false }, matches: [], noStrongMatch: false };
  if (!input || typeof input !== "object") return empty;
  const raw = input as Record<string, unknown>;

  const matches: SafeMatchProduct[] = Array.isArray(raw.matches)
    ? raw.matches
        .map((m): SafeMatchProduct | null => {
          if (!m || typeof m !== "object") return null;
          const r = m as Record<string, unknown>;
          const productKey = str(r.productKey, 120);
          const matchClass = asClass(r.matchClass);
          const why = str(r.why, 400);
          if (!productKey || !matchClass || !why) return null;
          return { productKey, productName: str(r.productName, 120) || productKey, matchClass, why };
        })
        .filter((m): m is SafeMatchProduct => m !== null)
        .slice(0, 12)
    : [];

  const cs = (raw.crownState && typeof raw.crownState === "object" ? raw.crownState : {}) as Record<string, unknown>;

  let whatToLookFor: WhatToLookFor | undefined;
  const g = raw.whatToLookFor;
  if (g && typeof g === "object") {
    const r = g as Record<string, unknown>;
    const hairNeed = str(r.hairNeed);
    const productType = str(r.productType);
    const whyThisMatters = str(r.whyThisMatters);
    whatToLookFor = {
      ...(hairNeed ? { hairNeed } : {}),
      ...(productType ? { productType } : {}),
      formulationCharacteristics: list(r.formulationCharacteristics),
      ingredientFunctions: list(r.ingredientFunctions),
      whatMayNotFit: list(r.whatMayNotFit),
      ...(whyThisMatters ? { whyThisMatters } : {}),
    };
  }

  let safeLinks: SafeLinks | undefined;
  const l = raw.safeLinks;
  if (l && typeof l === "object") {
    const r = l as Record<string, unknown>;
    const productHub = str(r.productHub, 400);
    const assessment = str(r.assessment, 400);
    const crownstateUpdate = str(r.crownstateUpdate, 400);
    if (productHub || assessment || crownstateUpdate) {
      safeLinks = { ...(productHub ? { productHub } : {}), ...(assessment ? { assessment } : {}), ...(crownstateUpdate ? { crownstateUpdate } : {}) };
    }
  }

  return {
    crownPrintPresent: raw.crownPrintPresent === true,
    crownState: { present: cs.present === true, fresh: cs.fresh === true, ...(str(cs.message, 300) ? { message: str(cs.message, 300) } : {}) },
    ...(str(raw.currentPriorityLabel, 160) ? { currentPriorityLabel: str(raw.currentPriorityLabel, 160) } : {}),
    matches,
    noStrongMatch: raw.noStrongMatch === true || !matches.some((m) => m.matchClass === "strong"),
    ...(whatToLookFor ? { whatToLookFor } : {}),
    ...(safeLinks ? { safeLinks } : {}),
    ...(str(raw.ruleVersion, 60) ? { ruleVersion: str(raw.ruleVersion, 60) } : {}),
    ...(str(raw.generatedAt, 60) ? { generatedAt: str(raw.generatedAt, 60) } : {}),
  };
}

export const hasStrongMatch = (c: WynnMatchContext) => c.matches.some((m) => m.matchClass === "strong");

// ---------------------------------------------------------------------------
// Wynn-side session. AFTER the single exchange we store ONLY the safe context
// server-side (crownprint_sessions), keyed by an opaque id held in a signed,
// httpOnly cookie. This is a Wynn-local mechanism, entirely separate from the
// HWL one-time code (which is already dead). It gives match continuity across
// views WITHOUT ever re-contacting HWL with the code.
// ---------------------------------------------------------------------------
const SESSION_COOKIE = "we_crownprint_session";
const PENDING_COOKIE = "we_cp_pending";
const SESSION_TTL_SECONDS = 30 * 60;  // Wynn session; unrelated to the code's ~2-min TTL
// Long enough to sign in at HWL, pay for / complete an assessment, and come
// back. Too short and a legitimate return fails CSRF and silently lands the
// shopper back on the landing page, which reads exactly like a broken CTA.
const PENDING_TTL_SECONDS = 45 * 60;

async function packSigned(value: string, ttlSeconds: number): Promise<string> {
  const secret = crownprintConfig.sessionSecret;
  if (!secret) throw new Error("WYNN_SESSION_SECRET is not configured.");
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const payload = `${b64url(encoder.encode(value))}.${expiresAt}`;
  return `${payload}.${await hmac(secret, payload, "b64url")}`;
}
async function readSigned(raw: string | undefined): Promise<string | null> {
  const secret = crownprintConfig.sessionSecret;
  if (!secret || !raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [encoded, expiresAt, sig] = parts;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Date.now()) return null;
  if (!safeEqual(sig, await hmac(secret, `${encoded}.${expiresAt}`, "b64url"))) return null;
  try { return new TextDecoder().decode(Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))); } catch { return null; }
}

// Store the freshly exchanged safe context; set the session cookie. Returns
// false if the session could not be persisted (caller then shows an explicit
// temporarily-unavailable state rather than fabricating anything).
export async function createMatchSession(context: WynnMatchContext): Promise<boolean> {
  if (!crownprintConfig.sessionSecret) return false;
  const id = b64url(crypto.getRandomValues(new Uint8Array(32)));
  try {
    const { getDb } = await import("../db");
    const { crownprintSessions } = await import("../db/schema");
    await getDb().insert(crownprintSessions).values({ id, context, expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) });
  } catch {
    return false;
  }
  (await cookies()).set(SESSION_COOKIE, await packSigned(id, SESSION_TTL_SECONDS), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return true;
}

// Read the current safe context from the Wynn session (render-time; read-only).
export async function readMatchSession(): Promise<WynnMatchContext | null> {
  const id = await readSigned((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) return null;
  try {
    const { getDb } = await import("../db");
    const { crownprintSessions } = await import("../db/schema");
    const rows = await getDb().select().from(crownprintSessions).where(eq(crownprintSessions.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) return null;
    return row.context as WynnMatchContext;
  } catch {
    return null;
  }
}

export async function clearMatchSession(): Promise<void> {
  const jar = await cookies();
  const id = await readSigned(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  if (!id) return;
  try {
    const { getDb } = await import("../db");
    const { crownprintSessions } = await import("../db/schema");
    await getDb().delete(crownprintSessions).where(eq(crownprintSessions.id, id));
  } catch { /* best effort */ }
}

// ---------------------------------------------------------------------------
// CSRF: a signed, httpOnly "pending" cookie set on the outbound hop. Its valid
// presence on return proves THIS browser initiated the connect within the window
// — mitigating blind connect-code injection without HWL echoing any state.
// ---------------------------------------------------------------------------
export async function issuePending(): Promise<void> {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  (await cookies()).set(PENDING_COOKIE, await packSigned(nonce, PENDING_TTL_SECONDS), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PENDING_TTL_SECONDS,
  });
}
export async function consumePending(): Promise<boolean> {
  const jar = await cookies();
  const raw = jar.get(PENDING_COOKIE)?.value;
  jar.delete(PENDING_COOKIE);
  return (await readSigned(raw)) !== null;
}

// ---------------------------------------------------------------------------
// Outbound redirects to HWL. Only a validated `return` URL is sent — never any
// CrownPrint data. `connect` re-verifies an existing CrownPrint; `create` runs
// the assessment; `refresh` updates CrownState. Each returns a NEW one-time code.
// ---------------------------------------------------------------------------
// The `return` URL we hand HWL must be a Wynn URL we actually own. `Host` and
// `X-Forwarded-Host` are attacker-controllable, so a forwarded host is only
// trusted when it matches the configured site host (or a Vercel preview /
// localhost). Otherwise we fall back to the configured origin. This is what
// makes "validated Wynn return URL" true rather than aspirational.
function hostIsOurs(host: string): boolean {
  const bare = host.split(":")[0].toLowerCase();
  let configured = "";
  try { configured = new URL(commerceConfig.siteUrl).hostname.toLowerCase(); } catch { /* ignore */ }
  if (configured && (bare === configured || bare === `www.${configured}` || `www.${bare}` === configured)) return true;
  if (bare === "localhost" || bare === "127.0.0.1") return true;
  return bare.endsWith(".vercel.app");
}

export async function siteOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    const proto = h.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
    if (host && hostIsOurs(host)) return `${proto}://${host}`;
  } catch { /* fall through */ }
  return new URL(commerceConfig.siteUrl).origin;
}
export function returnUrl(origin: string) {
  return `${origin}${RETURN_PATH}`;
}

// Resolve the HWL destination for a flow. Each flow has its OWN target — the
// connect CTA must never share a URL with the create CTA, and neither may
// resolve to a Wynn URL.
export function outboundBase(flow: "connect" | "create" | "refresh"): string | null {
  if (flow === "connect") return crownprintConfig.apiBaseUrl ? `${crownprintConfig.apiBaseUrl}${CONNECT_PATH}` : null;
  if (flow === "create") return crownprintConfig.assessmentUrl;
  return crownprintConfig.crownstateUpdateUrl;
}

export async function buildOutboundRedirect(flow: "connect" | "create" | "refresh"): Promise<string | null> {
  if (!crownprintConfig.sessionSecret) return null;
  const base = outboundBase(flow);
  if (!base) return null;

  const origin = await siteOrigin();
  const ret = returnUrl(origin);
  let url: URL;
  try { url = new URL(base); } catch { return null; }        // malformed env → explicit unavailable
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  // HARD GUARD against the connect loop: the outbound target must be Hair
  // Wellness Lab, never Wynn Essentials. If an HWL_* env is misconfigured to a
  // Wynn URL, the CTA becomes a self-redirect and the shopper bounces straight
  // back to the page they started on. Refuse and show the explicit unavailable
  // state instead of looping.
  if (url.origin === new URL(ret).origin) return null;

  await issuePending();
  url.searchParams.set("return", ret);
  url.searchParams.set("source", "wynn-essentials");
  return url.toString();
}
