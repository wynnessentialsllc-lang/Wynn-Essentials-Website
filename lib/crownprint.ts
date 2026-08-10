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
//  2. HWL RESOLVES THE USER'S ACTUAL STATE — authenticate, verify the CrownPrint
//     entitlement is active (not refunded/revoked), verify the assessment is
//     complete and its results exist, read the latest CrownState — and returns
//     ONE of:
//       • MATCH_READY            → plus an OPAQUE ONE-TIME connect code
//                                  (~256-bit, ~2-min TTL, audience-bound to Wynn,
//                                  stored HWL-side only as a keyed hash,
//                                  atomically redeemed once, replay rejected)
//       • NO_CROWNPRINT          → status only, NO code
//       • CROWNSTATE_STALE       → status (optionally with a code so Wynn can
//                                  still show the existing matches)
//       • AUTH_REQUIRED          → status only, NO code
//       • TEMPORARILY_UNAVAILABLE→ status only, NO code
//     A code is minted ONLY for a genuinely match-ready shopper. Being merely
//     authenticated is never enough.
//  3. Wynn's server exchanges a code EXACTLY ONCE via an HMAC-signed
//     server-to-server POST to /api/integrations/wynn-essentials/match. HWL
//     atomically redeems the code and returns a safe WynnMatchContext.
//  4. The code is dead after that single exchange. Wynn discards it and keeps only
//     a minimal, server-side Wynn session (see lib session helpers) to render the
//     experience. Wynn NEVER re-exchanges the HWL code and NEVER treats it as a
//     long-lived API credential.
//  5. Every outcome resolves to an explicit state (lib/crownprint-state.mjs) that
//     the Shop by CrownPrint page renders with its own message and CTA. Nothing
//     bounces the shopper back to the generic intro page unexplained.
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
import {
  crownStateAction as crownStateActionJs,
  deriveContextStatus as deriveContextStatusJs,
  isRecoveryMarker as isRecoveryMarkerJs,
  hasStrongMatch as hasStrongMatchJs,
  normalizeMatchContext as normalizeMatchContextJs,
  parseConnectStatus as parseConnectStatusJs,
  parseReturnState as parseReturnStateJs,
  resolveExperienceState as resolveExperienceStateJs,
} from "./crownprint-state.mjs";

// The state machine itself is plain, dependency-free JS so it can be unit-tested
// directly (tests/crownprint-state.test.mjs) and so the callback route and the
// page render can never drift apart. These wrappers put the TypeScript contract
// back on top of it.

/** What HWL may assert on the return hop. */
export type ConnectStatus =
  | "MATCH_READY"
  | "NO_CROWNPRINT"
  | "CROWNSTATE_STALE"
  | "AUTH_REQUIRED"
  | "INTEGRATION_UNAVAILABLE"
  | "TEMPORARILY_UNAVAILABLE";

/** Wynn-local markers our own callback adds; never a claim about CrownPrint. */
export type LocalReturnState = "EXPIRED" | "CANCELLED" | "DISCONNECTED" | "ERROR" | "SESSION_LOST";

/** Everything the landing page knows how to render. */
export type ExperienceState = Exclude<ConnectStatus, never> | "CONNECT";

export type ResolvedExperience = { state: ExperienceState; showResults: boolean; note?: string };

/** Parse a status HWL put on the return hop (null when absent/unrecognized). */
export const parseConnectStatus = (raw: unknown): ConnectStatus | null =>
  parseConnectStatusJs(raw) as ConnectStatus | null;

/** Parse the `?state=` marker on the Wynn landing URL (superset of the above). */
export const parseReturnState = (raw: unknown): ConnectStatus | LocalReturnState | null =>
  parseReturnStateJs(raw) as ConnectStatus | LocalReturnState | null;

// ---------------------------------------------------------------------------
// Approved safe contract (WynnMatchContext). These are the ONLY fields Wynn ever
// stores or renders. Nothing here can express a score, weight, threshold, axis,
// reason code, user id, or any raw CrownPrint / CrownState / CrownHistory detail.
// ---------------------------------------------------------------------------

export type MatchClass = "strong" | "good" | "conditional";

/**
 * HWL's formulation evidence for one match. Mechanism, not performance: it says
 * a formulation carries a capability CrownPrint asked for, never that the
 * finished product achieves a result. Wynn renders it verbatim and never
 * reconstructs chemistry of its own.
 */
export type SafeEvidence = {
  ingredient?: string;      // "Rice protein"
  capabilityKey?: string;   // "proteins_peptides" — the durable identifier
  statement?: string;       // consumer-safe sentence, HWL's wording
};

export type SafeMatchProduct = {
  productKey: string;   // HWL's key; resolved to a catalog slug by crownprint-catalog-key
  productName: string;  // convenience label from HWL; catalog name is authoritative
  matchClass: MatchClass;
  why: string;          // consumer-safe explanation of FIT (not a new efficacy claim)
  needServed?: string;      // the CrownPrint need, e.g. "Strength & Protein Support"
  functionServed?: string;  // the function, e.g. "Temporarily reinforce the fibre"
  functionKey?: string;     // stable identifier for that function
  evidence?: SafeEvidence;  // why the formulation qualifies
  limitation?: string;      // what this match does NOT address
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

/** A resolved, consumer-safe point HWL sends: a priority, a function, a gap. */
export type SafePoint = { label: string; detail?: string };

/** How well Wynn Essentials serves one resolved product function. */
export type CoverageStatus = "covered" | "partial" | "not_carried";

/**
 * Descriptive coverage metadata — NEVER a source of product cards.
 *
 * Note the absence of any product field. That is deliberate and enforced at the
 * boundary (`asCoverage` in lib/crownprint-state.mjs drops productKey/slug/
 * products outright), so no amount of downstream code can turn a coverage row
 * into a recommendation. Coverage explains; `matches` recommends.
 */
export type SafeCoverage = {
  /** The stable integration identifier. The only coverage field to key on. */
  functionKey: string;
  status: CoverageStatus;
  detail?: string;
  /**
   * Display NAMES of products that qualify for this function. Names only — no
   * keys, slugs or ids — so this can be read but never joined, and therefore
   * never becomes a product card. Authorization remains `matches` alone.
   */
  qualifyingProducts?: string[];
  /**
   * @deprecated Display text only, readable until 2026-11-30. HWL may reword it
   * at any time, so nothing may branch, match, or select on it.
   */
  functionLabel?: string;
};

/**
 * Accessories and tools: a separate support channel, explicitly sourced by HWL.
 * Rendered in their own section and never as CrownPrint product cards, so a
 * suggested bonnet can never be mistaken for a resolved formulation match.
 */
export type SafeAccessory = { productKey: string; why?: string };

export type WynnMatchContext = {
  crownPrintPresent: boolean;                 // CrownPrint exists / missing
  crownState: { present: boolean; fresh: boolean; message?: string; summary?: string };
  crownPrintCode?: string;                    // the shopper's own printed code
  currentPriorityLabel?: string;              // consumer-safe priority label
  currentPriorities?: SafePoint[];            // HWL's ranked priorities
  productFunctionsNeeded?: SafePoint[];       // what the routine must do — Wynn matches on these
  notCarried?: SafePoint[];                   // needs HWL resolved that Wynn doesn't carry
  coverage?: SafeCoverage[];                  // descriptive coverage only — never product cards
  accessories?: SafeAccessory[];              // separate accessory/tool support channel
  matches: SafeMatchProduct[];                // THE ONLY source of CrownPrint product cards
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

// The ONE valid Hair Wellness Lab production origin: hair + wellness + s + lab,
// i.e. three consecutive "s" where "wellness" meets "slab". A two-"s" near-miss
// host is a different domain that Wynn must never talk to — see hwlUrl() below,
// which is what actually enforces this at every HWL URL sink.
export const HWL_CANONICAL_ORIGIN = "https://hairwellnessslab.com";

// Origins are stored bare: the flow URLs below concatenate fixed contract paths,
// so a trailing slash would compose into "https://host//crownprint".
const trimTrailingSlash = (u: string) => u.replace(/\/+$/, "");

export const crownprintConfig = {
  apiBaseUrl: process.env.HWL_API_BASE_URL ? trimTrailingSlash(process.env.HWL_API_BASE_URL) : null,
  hmacSecret: process.env.WYNN_INTEGRATION_HMAC_SECRET || null,     // signs the exchange
  assessmentUrl: process.env.HWL_ASSESSMENT_URL || null,           // create CrownPrint
  crownstateUpdateUrl: process.env.HWL_CROWNSTATE_UPDATE_URL || null, // refresh CrownState
  productHubUrl: process.env.HWL_PRODUCT_HUB_URL || null,           // no-strong-match CTA
  // Wynn-LOCAL secret used only to sign Wynn's own session/CSRF cookies. It is
  // never the HWL connect-code secret and is never shared with HWL.
  sessionSecret: process.env.WYNN_SESSION_SECRET || process.env.ADMIN_ORDERS_TOKEN || null,
};

// The origin every HWL URL must sit on. HWL_API_BASE_URL defines it so a local
// or staging HWL can still be pointed at during development; in production it
// must be HWL_CANONICAL_ORIGIN, which productionOriginOk() reports on.
export function hwlOrigin(): string | null {
  if (!crownprintConfig.apiBaseUrl) return null;
  try {
    return new URL(crownprintConfig.apiBaseUrl).origin;
  } catch {
    console.error("[crownprint] HWL_API_BASE_URL is not a valid absolute URL.");
    return null;
  }
}

// False when a production deployment is pointed at something other than the
// canonical origin — the exact misspelling/typo case this guard exists for.
export function productionOriginOk(): boolean {
  const origin = hwlOrigin();
  if (!origin) return false;
  if (process.env.NODE_ENV !== "production") return true;
  return origin === HWL_CANONICAL_ORIGIN;
}

/**
 * Validate ONE HWL URL against the trusted HWL origin, returning null if it
 * does not belong there.
 *
 * Every HWL-bound URL in this file passes through here, whether it came from an
 * HWL_* env override or from the `safeLinks` block of an HWL match response.
 * Without this, an override or a response field could send a shopper to a
 * near-miss host, an unrelated origin, or a `javascript:` URL — the last of
 * which is rendered straight into an href on the Shop by CrownPrint page.
 * Rejecting is always safe: each caller falls back to a contract path on the
 * base URL, or omits the CTA entirely.
 */
export function hwlUrl(value: string | null | undefined, label = "HWL url"): string | null {
  if (!value) return null;
  const origin = hwlOrigin();
  if (!origin) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    console.error(`[crownprint] ${label} is not a valid absolute URL; ignoring it.`);
    return null;
  }
  // Covers foreign hosts, the two-"s" near-miss domain, and non-http schemes
  // (javascript:/data: parse fine but have an opaque origin that never matches).
  if (parsed.origin !== origin) {
    console.error(`[crownprint] ${label} points at ${parsed.origin}, not the trusted HWL origin ${origin}; ignoring it.`);
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return parsed.toString();
}

// Fixed contract endpoints implemented by Hair Wellness Lab.
const MATCH_PATH = "/api/integrations/wynn-essentials/match";
const CONNECT_PATH = "/crownprint/connect";
const RETURN_PATH = "/shop-by-crownprint/connect";
// CrownPrint is a paid ($9.99 one-time) Hair Wellness Lab product, so "create"
// sends the shopper to the CrownPrint landing/purchase page — NOT straight into
// the assessment, which HWL gates behind its own entitlement check.
const CREATE_PATH = "/crownprint";
const CROWNSTATE_PATH = "/crownstate";

// True when the safe-match exchange can be signed and sent.
export function crownprintApiConfigured() {
  return Boolean(crownprintConfig.apiBaseUrl && crownprintConfig.hmacSecret);
}

/**
 * Absolute HWL URL for an outbound flow.
 *
 * The HWL_* env overrides stay authoritative when set, but each flow falls back
 * to its fixed contract path on HWL_API_BASE_URL. Without these fallbacks a
 * single unset optional env var (e.g. HWL_ASSESSMENT_URL) silently made a CTA
 * unbuildable, which surfaced to shoppers as a redirect straight back to the
 * Shop by CrownPrint page.
 */
function hwlFlowUrl(flow: "connect" | "create" | "refresh"): string | null {
  const base = crownprintConfig.apiBaseUrl;
  // Connect is always contract-derived — there is no env override for it.
  if (flow === "connect") return base ? `${base}${CONNECT_PATH}` : null;
  // An override is honoured only when it sits on the trusted HWL origin. A
  // foreign or misspelled host is dropped in favour of the contract path, so a
  // bad override degrades to the correct URL instead of redirecting shoppers
  // off-origin.
  const [override, path, name] =
    flow === "create"
      ? [crownprintConfig.assessmentUrl, CREATE_PATH, "HWL_ASSESSMENT_URL"]
      : [crownprintConfig.crownstateUpdateUrl, CROWNSTATE_PATH, "HWL_CROWNSTATE_UPDATE_URL"];
  return hwlUrl(override, name) || (base ? `${base}${path}` : null);
}

// True when the whole round-trip can work (send to HWL, exchange, store a Wynn
// session). When false the experience shows an explicit integration-unavailable
// state — never fabricated results, never a dead CTA.
export function crownprintIntegrationReady() {
  return crownprintApiConfigured() && Boolean(hwlFlowUrl("create")) && Boolean(crownprintConfig.sessionSecret);
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
  // base64url, matching what Hair Wellness Lab's verifier computes and compares
  // in constant time. See EXCHANGE_TIMESTAMP_UNIT below for the other half of
  // this contract.
  return hmac(crownprintConfig.hmacSecret, `${timestamp}.${rawBody}`, "b64url");
}

/**
 * The unit of X-Wynn-Timestamp. HWL's verifier computes freshness as
 * `Math.abs(nowSeconds - timestamp) > tolerance` against a 300-SECOND window, so
 * a millisecond timestamp reads as roughly 56,000 years in the future and is
 * rejected as stale before the signature is even computed. Named as a constant
 * because it is a contract term, not an implementation detail.
 */
export const EXCHANGE_TIMESTAMP_UNIT = "seconds";
export const exchangeTimestamp = () => String(Math.floor(Date.now() / 1000));

// ---------------------------------------------------------------------------
// Non-secret diagnostics.
//
// A shared-secret mismatch and a signing-convention mismatch both surface as an
// identical 401, and neither side can see the other's secret. A truncated
// SHA-256 fingerprint settles which one it is: both sides log it, and the values
// either match or they don't. It is one-way and truncated, so it discloses
// nothing usable about a high-entropy secret.
//
// SERVER LOGS ONLY. The fingerprint is never returned in a response, never put
// in a URL, never persisted, and never reaches the browser — this module is
// server-only (it imports next/headers) and nothing here is rendered.
// ---------------------------------------------------------------------------
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** First 12 hex chars of SHA-256(secret). Comparable across sites, not reversible. */
export async function secretFingerprint(secret: string): Promise<string> {
  return (await sha256Hex(secret)).slice(0, 12);
}

/** SHA-256 of the exact bytes signed, so both sides can prove they agree on them. */
export const bodyFingerprint = (rawBody: string): Promise<string> => sha256Hex(rawBody);

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
  const timestamp = exchangeTimestamp();
  let signature: string;
  try {
    signature = await signExchange(timestamp, rawBody);
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  // The exchange as Wynn is about to send it, in terms both sides can compare.
  // No secret, no signature, no connect code, and no CrownPrint data.
  // Non-null by this point: crownprintApiConfigured() gated the call and
  // signExchange would have thrown otherwise. Narrowed explicitly so the
  // fingerprint can never be taken over an empty string and read as a match.
  const secret = crownprintConfig.hmacSecret;
  if (!secret) return { ok: false, reason: "unavailable" };
  const [secretFp, bodyFp] = await Promise.all([secretFingerprint(secret), bodyFingerprint(rawBody)]);
  console.info(
    `[crownprint] HMAC secret fingerprint: ${secretFp} · timestamp: ${timestamp} (unix ${EXCHANGE_TIMESTAMP_UNIT}) · rawBody SHA-256: ${bodyFp} · signing: HMAC-SHA256 over "<timestamp>.<rawBody>", base64url, header X-Wynn-Signature`,
  );
  try {
    const controller = new AbortController();
    // 8s, not 4s: this runs during a top-level redirect while the shopper waits,
    // and a cold HWL instance answering in 5s must not be reported to a
    // legitimately match-ready shopper as "temporarily unavailable".
    const timer = setTimeout(() => controller.abort(), 8000);
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
    if (res.status === 404 || res.status === 409 || res.status === 410) {
      console.error(`[crownprint] HWL rejected the connect code (${res.status}): unknown, already redeemed, or expired.`);
      return { ok: false, reason: "expired" };
    }
    // 401/403 → HWL did not accept our signature. In practice this is almost
    // always WYNN_INTEGRATION_HMAC_SECRET differing from the value HWL holds, or
    // a clock skew large enough to fail their timestamp window. Logged loudly
    // because it is invisible to the shopper and fatal to every connect attempt.
    if (res.status === 401 || res.status === 403) {
      console.error(
        `[crownprint] HWL rejected the exchange signature (${res.status}) for secret fingerprint ${secretFp}, timestamp ${timestamp} (unix ${EXCHANGE_TIMESTAMP_UNIT}), rawBody SHA-256 ${bodyFp}. Compare the fingerprint against the one Hair Wellness Lab logs: if they differ, WYNN_INTEGRATION_HMAC_SECRET does not match on the two sides. If they match, the signing contract differs — check timestamp unit, signature encoding, and that both sides signed these exact bytes.`,
      );
      return { ok: false, reason: "error" };
    }
    // 503 → HWL temporarily unavailable (distinct from "no CrownPrint").
    if (res.status === 503) return { ok: false, reason: "unavailable" };
    console.error(`[crownprint] Unexpected ${res.status} from the HWL match endpoint.`);
    return { ok: false, reason: "error" };
  } catch (err) {
    // Network error / timeout → temporarily unavailable, never fabricated.
    console.error("[crownprint] The HWL match exchange failed to complete:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "unavailable" };
  }
}

// ---------------------------------------------------------------------------
// Boundary normalization + state resolution. The implementations live in
// lib/crownprint-state.mjs; these are the typed entry points. The whitelist
// accepts ONLY approved safe fields — everything else on the wire (userUuid,
// scores, weights, thresholds, axis values, reasonCodes, CrownState/CrownHistory
// detail, report content, evidence logic) is dropped — and it gates matches on a
// usable entitlement, so a refunded or revoked CrownPrint yields no matches.
// ---------------------------------------------------------------------------

export function normalizeMatchContext(input: unknown): WynnMatchContext {
  // safeLinks arrive in the HWL response BODY and are rendered directly into
  // hrefs, so the shared normalizer validates each one against the trusted HWL
  // origin. Passing hwlOrigin() in keeps crownprint-state.mjs dependency-free
  // (no env, no next/*) while preserving the origin check; with no origin the
  // normalizer fails closed and drops every link.
  return normalizeMatchContextJs(input, { hwlOrigin: hwlOrigin() }) as WynnMatchContext;
}

export const hasStrongMatch = (c: WynnMatchContext) => hasStrongMatchJs(c) as boolean;

/**
 * The status a freshly exchanged context represents. Entitlement is the gate, so
 * a context without a usable CrownPrint is NO_CROWNPRINT regardless of anything
 * else HWL sent — a revoked CrownPrint can never resolve to MATCH_READY.
 */
export const deriveContextStatus = (c: WynnMatchContext | null): ConnectStatus =>
  deriveContextStatusJs(c) as ConnectStatus;

/**
 * What Wynn should do about CrownState: "none" when HWL already holds a fresh
 * one (never re-ask), "refresh" when HWL flagged it stale (HWL's free update
 * flow), "ask" only when there is no trusted context at all.
 */
export const crownStateAction = (context: WynnMatchContext | null): "none" | "refresh" | "ask" =>
  crownStateActionJs(context) as "none" | "refresh" | "ask";

/**
 * True when the marker on the URL means the handoff broke, not that the shopper
 * lacks a CrownPrint. Drives the reconnect panel (no price, no retake).
 */
export const isRecoveryMarker = (requested: ConnectStatus | LocalReturnState | null): boolean =>
  isRecoveryMarkerJs(requested) as boolean;

/** Decide what /shop-by-crownprint renders for this request. */
export const resolveExperienceState = (input: {
  integrationReady?: boolean;
  context?: WynnMatchContext | null;
  requested?: ConnectStatus | LocalReturnState | null;
}): ResolvedExperience => resolveExperienceStateJs(input) as ResolvedExperience;

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
const PENDING_TTL_SECONDS = 15 * 60;

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
/**
 * Consume the CSRF marker. The check itself is unchanged — a return hop without
 * a valid pending cookie never reaches the exchange — but the OUTCOME is now
 * distinguishable, because "the cookie never came back" and "the cookie was
 * tampered with or timed out" are different problems with different fixes:
 *
 *   missing  → the browser didn't send it. Usually the return landed on a
 *              different host than the one that set it (bare vs www, a preview
 *              domain), or the shopper finished the HWL flow in another browser.
 *   invalid  → present but unsigned/expired: past the 15-minute window, or a
 *              WYNN_SESSION_SECRET that changed between the two hops.
 */
export async function consumePending(): Promise<"ok" | "missing" | "invalid"> {
  const jar = await cookies();
  const raw = jar.get(PENDING_COOKIE)?.value;
  jar.delete(PENDING_COOKIE);
  if (!raw) return "missing";
  return (await readSigned(raw)) !== null ? "ok" : "invalid";
}

// ---------------------------------------------------------------------------
// Outbound redirects to HWL. Only a validated `return` URL is sent — never any
// CrownPrint data. `connect` re-verifies an existing CrownPrint; `create` runs
// the assessment; `refresh` updates CrownState. Each returns a NEW one-time code.
// ---------------------------------------------------------------------------
export async function siteOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    const proto = h.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
    if (host) return `${proto}://${host}`;
  } catch { /* fall through */ }
  return new URL(commerceConfig.siteUrl).origin;
}
export function returnUrl(origin: string) {
  return `${origin}${RETURN_PATH}`;
}

export async function buildOutboundRedirect(flow: "connect" | "create" | "refresh"): Promise<string | null> {
  if (!crownprintConfig.sessionSecret) {
    // Logged so a misconfiguration is diagnosable instead of surfacing to the
    // shopper as an unexplained bounce back to the landing page.
    console.error(`[crownprint] ${flow} redirect unavailable: WYNN_SESSION_SECRET is not set.`);
    return null;
  }
  const base = hwlFlowUrl(flow);
  if (!base) {
    console.error(`[crownprint] ${flow} redirect unavailable: HWL_API_BASE_URL is not set.`);
    return null;
  }
  await issuePending();
  const url = new URL(base);
  // ONLY the validated Wynn callback URL crosses to HWL — never CrownPrint
  // answers, user ids, scores, CrownState, CrownHistory or report content.
  url.searchParams.set("return", returnUrl(await siteOrigin()));
  url.searchParams.set("source", "wynn-essentials");
  return url.toString();
}
