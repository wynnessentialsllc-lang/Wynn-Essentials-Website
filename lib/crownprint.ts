// Shop by CrownPrint™ — server-only integration seam with Hair Wellness Lab.
//
// ARCHITECTURE
// Hair Wellness Lab (HWL) remains the source of truth for the CrownPrint Core,
// CrownState, CrownHistory, the CrownPrint assessment, its Intelligence Report,
// the scientific/evidence architecture, and the Wynn Essentials Match™
// deterministic intelligence. This file NEVER reimplements any of that. It is a
// thin, safe adapter: it hands a shopper off to HWL to create/refresh their
// CrownPrint, and it retrieves back only a minimal, consumer-safe match result.
//
// SECURITY
// - The HWL service token is read from a server-only env var and is never sent
//   to the browser (no NEXT_PUBLIC_ prefix). This module must only be imported
//   from server components / route handlers.
// - CrownPrint answers, raw scores, percentages, thresholds, scoring weights,
//   decision trees, reason codes, and evidence weighting are NEVER accepted into
//   the app. `normalizeSafeMatch` whitelists fields at the boundary, so even if a
//   future HWL response includes those, they are dropped before anything renders.
// - The shopper is identified by a short-lived, HMAC-signed, httpOnly cookie
//   carrying an opaque handoff token from HWL — never CrownPrint answers, and
//   never anything in a query parameter. This mirrors lib/admin-auth.ts.
//
// GRACEFUL DEGRADATION
// When HWL is not configured, getSafeMatch() returns an "unavailable" result and
// the storefront simply shows the "create your CrownPrint" state — the same
// fail-open posture Stripe, Resend, and the database use elsewhere in the app.

import { cookies, headers } from "next/headers";
import { commerceConfig } from "./commerce-config";

// ---------------------------------------------------------------------------
// Consumer-safe contract. These are the ONLY fields the shopping experience
// ever sees. Nothing here can express a score, weight, threshold, or reason code.
// ---------------------------------------------------------------------------

export type MatchClass = "strong" | "good" | "conditional";

export type MatchedProduct = {
  // Matched product identifier — must map to a Product.slug in app/data.ts. The
  // catalog stays the source of truth for image, name, price, and claims.
  slug: string;
  // Final match class only — no numeric score is ever carried.
  matchClass: MatchClass;
  // Consumer-safe, personalized explanation of FIT (not a new efficacy claim).
  explanation: string;
  // Optional usage guidance relevant to the shopper's current need.
  usage?: string;
};

// Guidance shown when no Wynn Essentials product is a strong match. This is an
// intentional, honest outcome — we do not force a recommendation.
export type NoMatchGuidance = {
  hairNeed: string;                     // WHAT YOUR HAIR NEEDS RIGHT NOW
  productType: string;                  // PRODUCT TYPE TO LOOK FOR
  formulationCharacteristics: string[]; // FORMULATION CHARACTERISTICS TO LOOK FOR
  ingredientFunctions: string[];        // INGREDIENT FUNCTIONS TO CONSIDER
  whatMayNotFit: string[];              // WHAT MAY NOT FIT YOUR CURRENT NEED
  whyThisMatters: string;               // WHY THIS MATTERS FOR YOUR CURRENT CROWNPRINT
};

export type SafeMatch = {
  available: boolean;          // CrownPrint available / unavailable
  fresh: boolean;              // CrownState fresh / stale
  currentPriority?: string;    // CURRENT HAIR PRIORITY (a consumer-safe label)
  matches: MatchedProduct[];   // matched identifiers + class + explanation
  noStrongMatch?: NoMatchGuidance; // present when nothing strongly matches
  refreshRequired?: boolean;   // refresh requirement flag from HWL
};

const UNAVAILABLE: SafeMatch = { available: false, fresh: false, matches: [] };

// ---------------------------------------------------------------------------
// Configuration (all server-only).
// ---------------------------------------------------------------------------

export const crownprintConfig = {
  // Server-to-server base URL for the approved HWL safe-match API.
  apiBaseUrl: process.env.HWL_API_BASE_URL || null,
  // Bearer service credential for the safe-match API. SERVER ONLY.
  serviceToken: process.env.HWL_SERVICE_TOKEN || null,
  // Path on the HWL API that exchanges a handoff token for a safe match.
  matchPath: process.env.HWL_MATCH_PATH || "/api/wynn-essentials-match",
  // Public HWL flows the shopper is redirected to.
  assessmentUrl: process.env.HWL_ASSESSMENT_URL || null,       // create CrownPrint
  crownstateUpdateUrl: process.env.HWL_CROWNSTATE_UPDATE_URL || null, // refresh CrownState
  productHubUrl: process.env.HWL_PRODUCT_HUB_URL || null,       // no-strong-match CTA
  // HMAC secret for signing the handoff cookie + CSRF state. Falls back to the
  // admin token so links keep working if a dedicated secret isn't set, but a
  // dedicated value is recommended.
  handoffSecret: process.env.CROWNPRINT_HANDOFF_SECRET || process.env.ADMIN_ORDERS_TOKEN || null,
  // Dev/preview only: when "1", the connect flow can seed a canned safe match so
  // the full experience is viewable before HWL is wired up. Never enable in prod.
  demo: process.env.CROWNPRINT_DEMO === "1",
};

export function crownprintApiConfigured() {
  return Boolean(crownprintConfig.apiBaseUrl && crownprintConfig.serviceToken);
}

// ---------------------------------------------------------------------------
// Handoff cookie: an HMAC-signed, httpOnly cookie holding an OPAQUE value only.
// The value is either the HWL handoff token or a "demo:<scenario>" marker. It is
// never CrownPrint answers and is never exposed to client JavaScript.
// ---------------------------------------------------------------------------

const COOKIE = "we_crownprint";
const STATE_COOKIE = "we_crownprint_state";
const MAX_AGE_SECONDS = 24 * 60 * 60; // one day; a fresh handoff re-issues it
const encoder = new TextEncoder();

function b64url(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sign(message: string) {
  const secret = crownprintConfig.handoffSecret;
  if (!secret) throw new Error("CrownPrint handoff secret is not configured.");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return b64url(new Uint8Array(sig));
}

// Constant-time string compare so a bad signature leaks nothing through timing.
function safeEqual(a: string, b: string) {
  const ab = encoder.encode(a), bb = encoder.encode(b);
  let mismatch = ab.length ^ bb.length;
  const max = Math.max(ab.length, bb.length);
  for (let i = 0; i < max; i++) mismatch |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return mismatch === 0;
}

// value.expiry.signature — where value is base64url of the opaque token.
async function pack(value: string) {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${b64url(encoder.encode(value))}.${expiresAt}`;
  return `${payload}.${await sign(payload)}`;
}
async function unpack(raw: string): Promise<string | null> {
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [encoded, expiresAt, signature] = parts;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Date.now()) return null;
  if (!safeEqual(signature, await sign(`${encoded}.${expiresAt}`))) return null;
  try {
    return new TextDecoder().decode(b64urlDecode(encoded));
  } catch {
    return null;
  }
}

// Persist the handoff. Called from the connect route after HWL returns.
export async function setHandoff(value: string) {
  if (!crownprintConfig.handoffSecret) return; // fail open — no signing key, no cookie
  (await cookies()).set(COOKIE, await pack(value), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // lax so the cookie survives the top-level redirect back from HWL
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearHandoff() {
  (await cookies()).delete(COOKIE);
}

async function readHandoff(): Promise<string | null> {
  if (!crownprintConfig.handoffSecret) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  return unpack(raw);
}

export async function hasHandoff() {
  return (await readHandoff()) !== null;
}

// CSRF state for the outbound → inbound redirect. A signed random value is
// stored in a short-lived cookie and echoed by HWL as `state` on return.
export async function issueState(): Promise<string> {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const value = `${nonce}.${await sign(nonce)}`;
  (await cookies()).set(STATE_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });
  return value;
}
export async function consumeState(returned: string | null): Promise<boolean> {
  const jar = await cookies();
  const stored = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  if (!stored) return false;
  if (!returned) return false;
  // Both must match exactly AND the nonce must carry a valid signature.
  if (!safeEqual(stored, returned)) return false;
  const [nonce, sig] = stored.split(".");
  if (!nonce || !sig) return false;
  return safeEqual(sig, await sign(nonce));
}

// ---------------------------------------------------------------------------
// Absolute URL for the return endpoint HWL redirects back to. Derived from the
// live request so it is correct in dev and prod without extra config.
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

// Build the outbound redirect to an HWL flow, preserving a secure return
// destination and a CSRF state. `flow` selects create vs. update.
export async function buildHwlRedirect(flow: "create" | "update"): Promise<string | null> {
  const base = flow === "create" ? crownprintConfig.assessmentUrl : crownprintConfig.crownstateUpdateUrl;
  if (!base) return null;
  const state = await issueState();
  const returnTo = `${await siteOrigin()}/shop-by-crownprint/connect`;
  const url = new URL(base);
  // return_to is our own connect endpoint (not sensitive); state guards the hop.
  url.searchParams.set("return_to", returnTo);
  url.searchParams.set("state", state);
  url.searchParams.set("source", "wynn-essentials");
  return url.toString();
}

// ---------------------------------------------------------------------------
// Boundary normalization: accept ONLY the safe contract fields. Anything else
// on the wire (scores, weights, reason codes, raw answers, …) is dropped here.
// ---------------------------------------------------------------------------

const clampStr = (v: unknown, max = 600): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

const clampList = (v: unknown, maxItems = 12, maxLen = 200): string[] =>
  Array.isArray(v)
    ? v.map((x) => clampStr(x, maxLen)).filter((x): x is string => Boolean(x)).slice(0, maxItems)
    : [];

const asClass = (v: unknown): MatchClass | null =>
  v === "strong" || v === "good" || v === "conditional" ? v : null;

export function normalizeSafeMatch(input: unknown): SafeMatch {
  if (!input || typeof input !== "object") return UNAVAILABLE;
  const raw = input as Record<string, unknown>;
  if (raw.available === false) return { ...UNAVAILABLE, available: false };

  const matches: MatchedProduct[] = Array.isArray(raw.matches)
    ? raw.matches
        .map((m): MatchedProduct | null => {
          if (!m || typeof m !== "object") return null;
          const r = m as Record<string, unknown>;
          const slug = clampStr(r.slug, 120);
          const matchClass = asClass(r.matchClass);
          const explanation = clampStr(r.explanation, 600);
          if (!slug || !matchClass || !explanation) return null;
          const usage = clampStr(r.usage, 400);
          return { slug, matchClass, explanation, ...(usage ? { usage } : {}) };
        })
        .filter((m): m is MatchedProduct => m !== null)
        .slice(0, 24)
    : [];

  let noStrongMatch: NoMatchGuidance | undefined;
  const g = raw.noStrongMatch;
  if (g && typeof g === "object") {
    const r = g as Record<string, unknown>;
    const hairNeed = clampStr(r.hairNeed);
    const productType = clampStr(r.productType);
    const whyThisMatters = clampStr(r.whyThisMatters);
    if (hairNeed || productType || whyThisMatters) {
      noStrongMatch = {
        hairNeed: hairNeed || "",
        productType: productType || "",
        formulationCharacteristics: clampList(r.formulationCharacteristics),
        ingredientFunctions: clampList(r.ingredientFunctions),
        whatMayNotFit: clampList(r.whatMayNotFit),
        whyThisMatters: whyThisMatters || "",
      };
    }
  }

  return {
    available: raw.available !== false,
    fresh: raw.fresh === true,
    currentPriority: clampStr(raw.currentPriority, 160),
    matches,
    ...(noStrongMatch ? { noStrongMatch } : {}),
    ...(raw.refreshRequired === true ? { refreshRequired: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// The one call the shopping experience makes. Reads the handoff cookie, asks
// HWL server-to-server for the safe match, and returns the normalized contract.
// Never throws; always resolves to a SafeMatch (UNAVAILABLE on any problem).
// ---------------------------------------------------------------------------
export async function getSafeMatch(): Promise<SafeMatch> {
  const handoff = await readHandoff();
  if (!handoff) return UNAVAILABLE;

  // Dev/preview canned scenarios so the full experience is viewable pre-HWL.
  if (handoff.startsWith("demo:")) {
    return crownprintConfig.demo ? demoMatch(handoff.slice("demo:".length)) : UNAVAILABLE;
  }

  if (!crownprintApiConfigured()) return UNAVAILABLE;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${crownprintConfig.apiBaseUrl}${crownprintConfig.matchPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${crownprintConfig.serviceToken}`,
      },
      // Only the opaque handoff is sent — never answers, never PII we can avoid.
      body: JSON.stringify({ handoff }),
      signal: controller.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) return UNAVAILABLE;
    return normalizeSafeMatch(await res.json());
  } catch {
    return UNAVAILABLE; // fail open to the "create your CrownPrint" state
  }
}

// Convenience selectors used by the page.
export const strongMatches = (m: SafeMatch) => m.matches.filter((x) => x.matchClass === "strong");
export const hasStrongMatch = (m: SafeMatch) => m.matches.some((x) => x.matchClass === "strong");

// ---------------------------------------------------------------------------
// Demo payloads (dev/preview only). Built from real catalog slugs so the cards
// render with real product data. Never used unless CROWNPRINT_DEMO=1.
// ---------------------------------------------------------------------------
function demoMatch(scenario: string): SafeMatch {
  if (scenario === "nomatch") {
    return {
      available: true,
      fresh: true,
      currentPriority: "Rebuilding elasticity after repeated coloring",
      matches: [
        { slug: "revaivl-protein-conditioner", matchClass: "conditional", explanation: "May help if your strands feel mushy or over-conditioned, but your current need points more to a targeted bonding treatment than a rinse-out protein conditioner.", usage: "Use no more than once every two weeks and always follow with a moisturizing step." },
      ],
      noStrongMatch: {
        hairNeed: "Focused strength rebuilding and bond support for chemically stressed strands.",
        productType: "A leave-in or in-shower bond-building treatment (not a standard conditioner or oil).",
        formulationCharacteristics: ["Concentrated actives, used sparingly", "Balanced with moisture so hair doesn't turn brittle", "Lightweight enough to layer under your normal routine"],
        ingredientFunctions: ["Bond-supporting actives", "Strengthening amino acids / hydrolyzed proteins", "Humectants to keep protein from over-drying"],
        whatMayNotFit: ["Heavy sealing oils on their own", "Moisture-only routines without any strength support"],
        whyThisMatters: "Your CrownPrint shows a current strength priority. Reaching for moisture alone right now may feel good short-term but won't address what your strands are asking for.",
      },
    };
  }
  if (scenario === "stale") {
    return {
      available: true,
      fresh: false,
      refreshRequired: true,
      currentPriority: "Moisture retention through a protective style",
      matches: [
        { slug: "hydrate-herbal-hair-mist", matchClass: "strong", explanation: "Fits your priority of keeping braids and the hair underneath hydrated between wash days.", usage: "Lightly mist daily on the hair beneath your style, then seal." },
        { slug: "nourish-oil", matchClass: "good", explanation: "A light sealing step to help lock in the moisture your current style tends to wick away.", usage: "Apply a few drops to ends and any dry areas 2–4 times a week." },
      ],
    };
  }
  // default: a fresh, strong-match scenario
  return {
    available: true,
    fresh: true,
    currentPriority: "Daily moisture + scalp comfort",
    matches: [
      { slug: "hydrate-herbal-hair-mist", matchClass: "strong", explanation: "Directly fits your current need for lightweight daily moisture without buildup.", usage: "Mist daily on dry or damp hair, focusing on drier areas." },
      { slug: "nourish-oil", matchClass: "strong", explanation: "Pairs with your moisture step to help your hair hold onto hydration longer.", usage: "Seal in moisture 2–4 times a week on lengths and ends." },
      { slug: "relief-oil", matchClass: "good", explanation: "A good fit for the scalp comfort your current state is flagging.", usage: "Massage into dry or itchy areas 1–3 times a week." },
      { slug: "uplyft-conditioner", matchClass: "conditional", explanation: "Worth considering on wash day if your hair also feels dry after cleansing.", usage: "Deep condition on wash day; leave on ~20 minutes and rinse." },
    ],
  };
}
