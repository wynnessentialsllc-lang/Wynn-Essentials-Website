// Shop by CrownPrint™ — the pure state machine that resolves what a shopper
// actually sees after a Hair Wellness Lab (HWL) round trip.
//
// WHY THIS FILE EXISTS
// The connect flow used to have exactly one success shape ("HWL returns ?code")
// and one failure shape ("HWL returns nothing"). Every real-world outcome that
// is not a match — no CrownPrint purchased, not signed in, CrownState gone
// stale, entitlement refunded, HWL down — collapsed into "no code", which the
// Wynn callback turned into a bare redirect back to /shop-by-crownprint. That
// is the connect loop: the shopper pressed CONNECT MY CROWNPRINT and landed on
// the same generic intro page with no explanation of what happened.
//
// So the return hop now carries an explicit STATUS, and this module is the one
// place that decides which state wins. It is deliberately plain, dependency-free
// JavaScript: no React, no next/headers, no fetch, no database. That keeps it
// directly unit-testable (see tests/crownprint-state.test.mjs) and keeps the
// decision logic identical on the callback route and on the page render.
//
// SAFETY
// Every value in here is a consumer-safe enum or a consumer-safe sentence.
// normalizeMatchContext() is the boundary whitelist: raw CrownPrint answers,
// axis values, scores, weights, thresholds, reason codes, CrownState/
// CrownHistory detail, report content, and user ids cannot pass through it even
// if HWL sends them.

// ---------------------------------------------------------------------------
// The status enum HWL returns on the connect hop, plus the Wynn-local markers
// our own callback adds. Wynn resolves an experience state from these; it never
// invents a match-ready outcome.
// ---------------------------------------------------------------------------

/** Match exists and is current — Wynn may render results. */
export const MATCH_READY = "MATCH_READY";
/** Authenticated at HWL, but no completed/paid CrownPrint (or it was revoked). */
export const NO_CROWNPRINT = "NO_CROWNPRINT";
/** CrownPrint exists, but the current CrownState is stale. */
export const CROWNSTATE_STALE = "CROWNSTATE_STALE";
/** HWL could not identify the user — they must sign in first. */
export const AUTH_REQUIRED = "AUTH_REQUIRED";
/** The Wynn↔HWL integration is not configured on this deployment. */
export const INTEGRATION_UNAVAILABLE = "INTEGRATION_UNAVAILABLE";
/** Configured, but HWL is down / timed out / errored. NOT "no CrownPrint". */
export const TEMPORARILY_UNAVAILABLE = "TEMPORARILY_UNAVAILABLE";

// Wynn-local return markers (never sent by HWL, never a claim about CrownPrint).
export const EXPIRED = "EXPIRED";
export const CANCELLED = "CANCELLED";
export const DISCONNECTED = "DISCONNECTED";
export const ERROR = "ERROR";
/** Nothing connected on this device yet — the educational intro + CTAs. */
export const CONNECT = "CONNECT";

/** The statuses HWL is allowed to put on the return hop. */
export const HWL_STATUSES = Object.freeze([
  MATCH_READY,
  NO_CROWNPRINT,
  CROWNSTATE_STALE,
  AUTH_REQUIRED,
  INTEGRATION_UNAVAILABLE,
  TEMPORARILY_UNAVAILABLE,
]);

/** Everything the Wynn landing page knows how to render. */
export const EXPERIENCE_STATES = Object.freeze([
  MATCH_READY,
  CROWNSTATE_STALE,
  NO_CROWNPRINT,
  AUTH_REQUIRED,
  TEMPORARILY_UNAVAILABLE,
  INTEGRATION_UNAVAILABLE,
  CONNECT,
]);

// Accept the enum in any reasonable casing/separator, plus the aliases HWL (or
// an older Wynn link) may use. Unknown values resolve to null and are treated as
// "no claim was made" rather than being guessed at.
const ALIASES = Object.freeze({
  MATCHREADY: MATCH_READY,
  READY: MATCH_READY,
  CONNECTED: MATCH_READY,
  MATCHES: MATCH_READY,

  NOCROWNPRINT: NO_CROWNPRINT,
  CROWNPRINTMISSING: NO_CROWNPRINT,
  MISSINGCROWNPRINT: NO_CROWNPRINT,
  CROWNPRINTNOTFOUND: NO_CROWNPRINT,
  NOTPURCHASED: NO_CROWNPRINT,

  CROWNSTATESTALE: CROWNSTATE_STALE,
  STALECROWNSTATE: CROWNSTATE_STALE,
  STALE: CROWNSTATE_STALE,

  AUTHREQUIRED: AUTH_REQUIRED,
  AUTHENTICATIONREQUIRED: AUTH_REQUIRED,
  SIGNINREQUIRED: AUTH_REQUIRED,
  LOGINREQUIRED: AUTH_REQUIRED,
  UNAUTHENTICATED: AUTH_REQUIRED,
  UNAUTHORIZED: AUTH_REQUIRED,

  INTEGRATIONUNAVAILABLE: INTEGRATION_UNAVAILABLE,
  NOTCONFIGURED: INTEGRATION_UNAVAILABLE,

  TEMPORARILYUNAVAILABLE: TEMPORARILY_UNAVAILABLE,
  TEMPORARYUNAVAILABLE: TEMPORARILY_UNAVAILABLE,
  SERVICEUNAVAILABLE: TEMPORARILY_UNAVAILABLE,
  UNAVAILABLE: TEMPORARILY_UNAVAILABLE,
});

// Wynn-local only. HWL is never trusted to assert these, and none of them is a
// statement about whether the shopper owns a CrownPrint.
const LOCAL_ALIASES = Object.freeze({
  EXPIRED: EXPIRED,
  LINKEXPIRED: EXPIRED,
  CANCELLED: CANCELLED,
  CANCELED: CANCELLED,
  DISCONNECTED: DISCONNECTED,
  ERROR: ERROR,
});

const key = (value) => (typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-Z]/g, "") : "");

/**
 * Parse a status HWL put on the return hop. Returns one of HWL_STATUSES, or
 * null when the value is absent/unrecognized (the caller then falls back to the
 * code-exchange result rather than guessing).
 */
export function parseConnectStatus(raw) {
  return ALIASES[key(raw)] || null;
}

/**
 * Parse the `?state=` marker on the Wynn landing URL. Superset of
 * parseConnectStatus: also understands Wynn's own EXPIRED / CANCELLED /
 * DISCONNECTED / ERROR markers and the pre-existing lowercase `?status=` values.
 */
export function parseReturnState(raw) {
  const k = key(raw);
  return ALIASES[k] || LOCAL_ALIASES[k] || null;
}

// ---------------------------------------------------------------------------
// Boundary normalization. ONLY the approved safe fields survive; everything else
// on the wire is dropped, so prohibited HWL data can never reach Wynn state,
// storage, analytics, or the DOM.
// ---------------------------------------------------------------------------

const str = (v, max = 600) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const list = (v, maxItems = 8, maxLen = 200) =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];
const asClass = (v) => (v === "strong" || v === "good" || v === "conditional" ? v : null);

// An entitlement that was refunded, revoked, charged back, expired, or never
// activated is not a CrownPrint Wynn may match against.
const DEAD_ENTITLEMENTS = new Set(["refunded", "revoked", "chargeback", "charged_back", "expired", "inactive", "cancelled", "canceled", "none"]);

/**
 * Whether HWL asserted a *usable* CrownPrint: entitlement active (not refunded
 * or revoked), assessment completed, and results/report present. Each flag is an
 * optional boolean — absent means "HWL did not qualify it", which we accept —
 * but an explicit `false` (or a dead entitlement status) always disqualifies.
 */
function crownPrintUsable(raw) {
  if (raw.crownPrintPresent !== true) return false;
  if (raw.entitlementActive === false) return false;
  if (raw.assessmentComplete === false) return false;
  if (raw.resultsReady === false) return false;
  const status = str(raw.entitlementStatus, 40);
  if (status && DEAD_ENTITLEMENTS.has(status.toLowerCase())) return false;
  return true;
}

/**
 * Whitelist an HWL match payload down to the approved WynnMatchContext.
 * Anything not named here (user ids, scores, weights, thresholds, axis values,
 * reason codes, CrownState/CrownHistory detail, report content, raw answers) is
 * dropped, and matches are gated on a usable entitlement so a refunded or
 * revoked CrownPrint can never render results.
 */
export function normalizeMatchContext(input) {
  const empty = { crownPrintPresent: false, crownState: { present: false, fresh: true }, matches: [], noStrongMatch: false };
  if (!input || typeof input !== "object") return empty;
  const raw = /** @type {Record<string, unknown>} */ (input);

  const crownPrintPresent = crownPrintUsable(raw);

  const matches = crownPrintPresent && Array.isArray(raw.matches)
    ? raw.matches
        .map((m) => {
          if (!m || typeof m !== "object") return null;
          const r = m;
          const productKey = str(r.productKey, 120);
          const matchClass = asClass(r.matchClass);
          const why = str(r.why, 400);
          if (!productKey || !matchClass || !why) return null;
          return { productKey, productName: str(r.productName, 120) || productKey, matchClass, why };
        })
        .filter((m) => m !== null)
        .slice(0, 12)
    : [];

  const cs = raw.crownState && typeof raw.crownState === "object" ? raw.crownState : {};
  // Stale ONLY when HWL says so explicitly. An omitted crownState must not nag a
  // shopper whose hair needs HWL never flagged as out of date.
  const crownState = {
    present: cs.present === true || cs.fresh === true,
    fresh: cs.fresh !== false,
    ...(str(cs.message, 300) ? { message: str(cs.message, 300) } : {}),
  };

  let whatToLookFor;
  const g = raw.whatToLookFor;
  if (g && typeof g === "object") {
    const r = g;
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

  let safeLinks;
  const l = raw.safeLinks;
  if (l && typeof l === "object") {
    const r = l;
    const productHub = str(r.productHub, 400);
    const assessment = str(r.assessment, 400);
    const crownstateUpdate = str(r.crownstateUpdate, 400);
    if (productHub || assessment || crownstateUpdate) {
      safeLinks = {
        ...(productHub ? { productHub } : {}),
        ...(assessment ? { assessment } : {}),
        ...(crownstateUpdate ? { crownstateUpdate } : {}),
      };
    }
  }

  return {
    crownPrintPresent,
    crownState,
    ...(str(raw.currentPriorityLabel, 160) ? { currentPriorityLabel: str(raw.currentPriorityLabel, 160) } : {}),
    matches,
    noStrongMatch: crownPrintPresent && (raw.noStrongMatch === true || !matches.some((m) => m.matchClass === "strong")),
    ...(whatToLookFor ? { whatToLookFor } : {}),
    ...(safeLinks ? { safeLinks } : {}),
    ...(str(raw.ruleVersion, 60) ? { ruleVersion: str(raw.ruleVersion, 60) } : {}),
    ...(str(raw.generatedAt, 60) ? { generatedAt: str(raw.generatedAt, 60) } : {}),
  };
}

export const hasStrongMatch = (context) => Boolean(context) && context.matches.some((m) => m.matchClass === "strong");

/**
 * The status a freshly exchanged context represents. Entitlement is the gate:
 * a context without a usable CrownPrint is NO_CROWNPRINT no matter what else
 * HWL sent, so a refunded/revoked CrownPrint can never be MATCH_READY.
 */
export function deriveContextStatus(context) {
  if (!context || context.crownPrintPresent !== true) return NO_CROWNPRINT;
  if (context.crownState && context.crownState.fresh === false) return CROWNSTATE_STALE;
  return MATCH_READY;
}

// Consumer-safe notes for the Wynn-local markers. None of these asserts anything
// about whether the shopper owns a CrownPrint.
const NOTES = Object.freeze({
  [EXPIRED]: "That secure link expired before we could finish. Please connect again.",
  [ERROR]: "We couldn't verify that securely. Please connect again.",
  [CANCELLED]: "No changes were made.",
  [DISCONNECTED]: "Your CrownPrint has been disconnected from this device.",
});

/**
 * Decide what /shop-by-crownprint renders.
 *
 * @param {object} input
 * @param {boolean} [input.integrationReady] Wynn can complete the round trip.
 * @param {object|null} [input.context] The safe context in the Wynn session, if any.
 * @param {string|null} [input.requested] The parsed `?state=` marker on the URL.
 * @returns {{state: string, showResults: boolean, note?: string}}
 */
export function resolveExperienceState(input) {
  const { integrationReady = false, context = null, requested = null } = input || {};
  const note = NOTES[requested];
  const withNote = (state, showResults = false) => (note ? { state, showResults, note } : { state, showResults });

  const contextStatus = context ? deriveContextStatus(context) : null;
  const sessionHasResults = contextStatus === MATCH_READY || contextStatus === CROWNSTATE_STALE;

  // 1. An explicit HWL resolution that is NOT match-ready always wins, even over
  //    a session from an earlier visit. This is what makes a revoked entitlement
  //    or a signed-out shopper stop showing stale results.
  if (requested === AUTH_REQUIRED) return { state: AUTH_REQUIRED, showResults: false };
  if (requested === NO_CROWNPRINT) return { state: NO_CROWNPRINT, showResults: false };
  if (requested === INTEGRATION_UNAVAILABLE || requested === TEMPORARILY_UNAVAILABLE) {
    // Honest about which kind of unavailable it is; never "you have no CrownPrint".
    return { state: integrationReady ? TEMPORARILY_UNAVAILABLE : INTEGRATION_UNAVAILABLE, showResults: false };
  }

  // 2. A live Wynn session is the ONLY source of rendered matches. `requested`
  //    can never manufacture results.
  if (sessionHasResults) return withNote(contextStatus, true);

  // 3. The session exists but carries no usable CrownPrint.
  if (contextStatus === NO_CROWNPRINT) return { state: NO_CROWNPRINT, showResults: false };

  // 4. HWL reported stale CrownState but we have no session to render matches
  //    from — still an explicit state, not the generic intro.
  if (requested === CROWNSTATE_STALE) return { state: CROWNSTATE_STALE, showResults: false };

  // 5. Nothing connected on this device.
  if (!integrationReady) return { state: INTEGRATION_UNAVAILABLE, showResults: false };
  return withNote(CONNECT, false);
}
