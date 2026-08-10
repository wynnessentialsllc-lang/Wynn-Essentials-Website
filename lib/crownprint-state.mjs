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
/**
 * The return hop arrived without the signed `we_cp_pending` cookie that this
 * browser set on the way out. The connect code is NOT exchanged — verification
 * is unchanged — but this is a browser-session problem, not a CrownPrint
 * verdict, so it gets its own marker and its own recovery copy.
 */
export const SESSION_LOST = "SESSION_LOST";
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
  SESSIONLOST: SESSION_LOST,
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

/**
 * A CrownPrint code as printed on the shopper's own Intelligence Report, e.g.
 * "P2-D3-T3-S2-E2". Shape-validated, never parsed for meaning here: Wynn shows
 * it back to the shopper as identification, and HWL stays the authority on what
 * it resolves to. Anything that isn't letter-digit pairs is dropped.
 */
const asCrownPrintCode = (v) => {
  const raw = str(v, 40);
  if (!raw) return undefined;
  const code = raw.toUpperCase().replace(/\s+/g, "");
  return /^[A-Z]\d{1,2}(-[A-Z]\d{1,2}){0,7}$/.test(code) ? code : undefined;
};

/**
 * A resolved, consumer-safe point list from HWL — current priorities, product
 * functions needed, or needs Wynn doesn't carry. Accepts plain strings or
 * {label, detail} objects, because the label alone is still useful. Everything
 * else on each entry is dropped.
 */
const asPoints = (v, maxItems = 8) => {
  if (!Array.isArray(v)) return [];
  return v
    .map((entry) => {
      if (typeof entry === "string") {
        const label = str(entry, 120);
        return label ? { label } : null;
      }
      if (!entry || typeof entry !== "object") return null;
      const label = str(entry.label ?? entry.name ?? entry.title, 120);
      if (!label) return null;
      const detail = str(entry.detail ?? entry.description ?? entry.why, 400);
      return detail ? { label, detail } : { label };
    })
    .filter((p) => p !== null)
    .slice(0, maxItems);
};

// ---------------------------------------------------------------------------
// Coverage — DESCRIPTIVE METADATA ONLY.
//
// coverage[] answers "did Wynn Essentials have something for this resolved
// function?" and nothing else. It is the input to an explanation, never to a
// product selection. The hard guarantee is structural rather than a rule people
// have to remember: this normalizer drops every product-identifying field on a
// coverage entry, so a coverage row that reached Wynn's render layer physically
// cannot name a product. `matches` is the only array that carries product keys.
//
// functionKey is the stable integration identifier — the durable join key
// between the two systems, and the only coverage field either side may depend
// on. functionLabel is human display text: HWL may reword it at any time, so
// nothing may key off it.
// ---------------------------------------------------------------------------

/**
 * The consumer-safe explanation fields HWL may attach to a match.
 *
 * ALL OF THIS IS HWL'S. Wynn renders it and adds nothing to it — no inferred
 * chemistry, no efficacy claim, no reworded mechanism. When HWL sends nothing,
 * the card shows less rather than showing something Wynn made up.
 *
 * `evidence` accepts either a finished sentence or the structured form
 * ({ ingredient, capabilityKey, statement }), because the contract carries the
 * capability key as the durable identifier and the prose as display text.
 */
const asEvidence = (v) => {
  if (typeof v === "string") {
    const statement = str(v, 400);
    return statement ? { statement } : undefined;
  }
  if (!v || typeof v !== "object") return undefined;
  const ingredient = str(v.ingredient ?? v.source, 120);
  const capabilityKey = asFunctionKey(v.capabilityKey ?? v.capability ?? v.key);
  const statement = str(v.statement ?? v.detail ?? v.why, 400);
  if (!ingredient && !capabilityKey && !statement) return undefined;
  return {
    ...(ingredient ? { ingredient } : {}),
    ...(capabilityKey ? { capabilityKey } : {}),
    ...(statement ? { statement } : {}),
  };
};

/** Legacy coverage display fields stay readable until this date, then come out. */
export const LEGACY_COVERAGE_FIELDS_READABLE_UNTIL = "2026-11-30";

/** A stable integration identifier: lower_snake, digits and dashes permitted. */
const asFunctionKey = (v) => {
  const raw = str(v, 80);
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return /^[a-z0-9][a-z0-9_-]*$/.test(key) ? key : undefined;
};

// "Partially supported" and "not carried" arrive under several spellings across
// contract revisions. Anything unrecognized is dropped rather than guessed at:
// an unknown status must never silently read as "covered".
const COVERAGE_STATUS = new Map([
  ["covered", "covered"],
  ["full", "covered"],
  ["supported", "covered"],
  ["partial", "partial"],
  ["partially_supported", "partial"],
  ["partially supported", "partial"],
  ["not_carried", "not_carried"],
  ["not carried", "not_carried"],
  ["uncovered", "not_carried"],
  ["unmet", "not_carried"],
]);
const asCoverageStatus = (v) => {
  const raw = str(v, 40);
  return raw ? COVERAGE_STATUS.get(raw.trim().toLowerCase()) : undefined;
};

/**
 * Whitelist coverage[] down to descriptive metadata.
 *
 * Note what is NOT read here and never will be: productKey, productKeys, slug,
 * slugs, products, recommend — any shape by which a coverage row could smuggle a
 * product into the page. An entry without a usable functionKey and status is
 * dropped entirely, because a coverage row Wynn cannot key on is a row it cannot
 * honestly explain.
 */
const asCoverage = (v, maxItems = 16) => {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of v) {
    if (!entry || typeof entry !== "object") continue;
    const functionKey = asFunctionKey(entry.functionKey ?? entry.key);
    const status = asCoverageStatus(entry.status ?? entry.coverage ?? entry.state);
    if (!functionKey || !status || seen.has(functionKey)) continue;
    seen.add(functionKey);
    // Deprecated display text, carried through for reading only. Selection never
    // touches it — see LEGACY_COVERAGE_FIELDS_READABLE_UNTIL.
    const functionLabel = str(entry.functionLabel ?? entry.label, 120);
    const detail = str(entry.detail ?? entry.description, 400);
    // Display NAMES only — never keys, slugs or ids. A shopper reading "Wynn can
    // cover cleansing (Lathyr)" is being told what the catalog is capable of;
    // the card grid above is still, and only, what CrownPrint authorized. Names
    // are deliberately unjoinable: nothing downstream can turn this into a
    // product card, because there is no identifier here to join on.
    const qualifyingProducts = list(entry.qualifyingProducts ?? entry.qualifyingProductNames, 6, 120);
    out.push({
      functionKey,
      status,
      ...(functionLabel ? { functionLabel } : {}),
      ...(detail ? { detail } : {}),
      ...(qualifyingProducts.length ? { qualifyingProducts } : {}),
    });
    if (out.length >= maxItems) break;
  }
  return out;
};

/**
 * Accessories and tools — a SEPARATE support channel, explicitly sourced.
 *
 * These are bonnets, scrunchies and the like: real product keys, but never
 * CrownPrint formulation matches and never rendered as CrownPrint product
 * cards. They exist as their own array precisely so that "HWL explicitly
 * suggested this tool" can never be confused with "this scored as a formulation
 * match", which is what a friction/overnight keyword rule used to do.
 */
const asAccessories = (v, maxItems = 6) => {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of v) {
    if (!entry || typeof entry !== "object") continue;
    const productKey = str(entry.productKey, 120);
    if (!productKey || seen.has(productKey)) continue;
    seen.add(productKey);
    const why = str(entry.why ?? entry.detail, 400);
    out.push({ productKey, ...(why ? { why } : {}) });
    if (out.length >= maxItems) break;
  }
  return out;
};

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
 * Validate ONE URL from the HWL response body against the trusted HWL origin,
 * returning null when it does not belong there.
 *
 * `safeLinks` values are rendered straight into hrefs, so an unchecked one could
 * send a shopper to a near-miss host, an unrelated origin, or a `javascript:`
 * URL. Rejecting is always safe — each caller falls back to a contract path on
 * the HWL base URL, or omits the CTA entirely.
 *
 * This module stays dependency-free (no env, no next/*), so the trusted origin
 * is passed IN by lib/crownprint.ts rather than read here. Fails closed: with no
 * origin supplied, every link is dropped.
 */
function trustedHwlUrl(value, hwlOrigin, label) {
  if (!value || !hwlOrigin) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    console.error(`[crownprint] ${label} is not a valid absolute URL; ignoring it.`);
    return null;
  }
  // Covers foreign hosts, the two-"s" near-miss domain, and non-http schemes
  // (javascript:/data: parse fine but have an opaque origin that never matches).
  if (parsed.origin !== hwlOrigin) {
    console.error(`[crownprint] ${label} points at ${parsed.origin}, not the trusted HWL origin ${hwlOrigin}; ignoring it.`);
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return parsed.toString();
}

/**
 * Whitelist an HWL match payload down to the approved WynnMatchContext.
 * Anything not named here (user ids, scores, weights, thresholds, axis values,
 * reason codes, CrownState/CrownHistory detail, report content, raw answers) is
 * dropped, and matches are gated on a usable entitlement so a refunded or
 * revoked CrownPrint can never render results.
 *
 * `options.hwlOrigin` is the trusted HWL origin every safeLink must sit on.
 */
export function normalizeMatchContext(input, options) {
  const hwlOrigin = (options && options.hwlOrigin) || null;
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
          // HWL's own explanation of the match. Optional, and absent means the
          // card simply says less — never that Wynn fills the gap itself.
          const needServed = str(r.needServed ?? r.need, 160);
          const functionServed = str(r.functionServed ?? r.function, 200);
          const functionKey = asFunctionKey(r.functionKey);
          const evidence = asEvidence(r.evidence);
          const limitation = str(r.limitation ?? r.boundary, 400);
          return {
            productKey,
            productName: str(r.productName, 120) || productKey,
            matchClass,
            why,
            ...(needServed ? { needServed } : {}),
            ...(functionServed ? { functionServed } : {}),
            ...(functionKey ? { functionKey } : {}),
            ...(evidence ? { evidence } : {}),
            ...(limitation ? { limitation } : {}),
          };
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
    // A consumer-safe sentence describing the shopper's CURRENT state, resolved
    // by HWL ("Braids, nearing takedown, tender scalp"). Its presence is what
    // lets Wynn show the context back without asking for it a second time.
    ...(str(cs.summary ?? cs.context, 300) ? { summary: str(cs.summary ?? cs.context, 300) } : {}),
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
    // These arrive in the HWL response body and are rendered as hrefs, so each
    // is validated against the trusted HWL origin before it can reach the page.
    const productHub = trustedHwlUrl(str(r.productHub, 400), hwlOrigin, "safeLinks.productHub");
    const assessment = trustedHwlUrl(str(r.assessment, 400), hwlOrigin, "safeLinks.assessment");
    const crownstateUpdate = trustedHwlUrl(str(r.crownstateUpdate, 400), hwlOrigin, "safeLinks.crownstateUpdate");
    if (productHub || assessment || crownstateUpdate) {
      safeLinks = {
        ...(productHub ? { productHub } : {}),
        ...(assessment ? { assessment } : {}),
        ...(crownstateUpdate ? { crownstateUpdate } : {}),
      };
    }
  }

  // The resolved 360 context. These are HWL's OWN conclusions — the priorities it
  // ranked, the product functions it says this CrownPrint needs, and the needs it
  // has already determined Wynn does not carry. Wynn consumes them rather than
  // re-deriving anything, so they are gated on a usable CrownPrint exactly like
  // matches are: a revoked entitlement resolves to nothing at all.
  const currentPriorities = crownPrintPresent ? asPoints(raw.currentPriorities) : [];
  const productFunctionsNeeded = crownPrintPresent ? asPoints(raw.productFunctionsNeeded ?? raw.productFunctions) : [];
  const notCarried = crownPrintPresent ? asPoints(raw.notCarried ?? raw.catalogGaps) : [];
  const crownPrintCode = crownPrintPresent ? asCrownPrintCode(raw.crownPrintCode ?? raw.code) : undefined;
  // Descriptive only, and product-free by construction (see asCoverage).
  const coverage = crownPrintPresent ? asCoverage(raw.coverage) : [];
  // The separate accessory-support channel. Gated on entitlement exactly like
  // matches: a revoked CrownPrint suggests no tools either.
  const accessories = crownPrintPresent ? asAccessories(raw.accessories ?? raw.accessorySupport) : [];

  return {
    crownPrintPresent,
    crownState,
    ...(crownPrintCode ? { crownPrintCode } : {}),
    ...(str(raw.currentPriorityLabel, 160) ? { currentPriorityLabel: str(raw.currentPriorityLabel, 160) } : {}),
    ...(currentPriorities.length ? { currentPriorities } : {}),
    ...(productFunctionsNeeded.length ? { productFunctionsNeeded } : {}),
    ...(notCarried.length ? { notCarried } : {}),
    ...(coverage.length ? { coverage } : {}),
    ...(accessories.length ? { accessories } : {}),
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
  [EXPIRED]: "That secure link expired before we could finish — they're only valid for a couple of minutes. Connecting again issues a fresh one.",
  [ERROR]: "We couldn't complete the secure handshake with the Hair Wellness Lab. That's on the connection, not on your CrownPrint — please try again.",
  [SESSION_LOST]: "That link came back without the browser session that started it, so we stopped rather than trust it. Starting again in this browser will sort it out.",
  [CANCELLED]: "No changes were made.",
  [DISCONNECTED]: "Your CrownPrint has been disconnected from this device.",
});

/**
 * What Wynn should do about CrownState for this shopper.
 *
 *   "none"    — a trusted, fresh CrownState already exists at HWL. Wynn must not
 *               ask the customer to answer it again. They completed a full
 *               assessment; repeating it on the storefront is both a worse
 *               experience and a second, competing source of truth.
 *   "refresh" — a trusted CrownState exists but HWL flagged it stale. The fix is
 *               HWL's free CrownState update flow, never a Wynn questionnaire
 *               and never another payment.
 *   "ask"     — no trusted context at all (the fallback path). Wynn asks the
 *               minimum current-state fields it needs to shop safely.
 */
export function crownStateAction(context) {
  if (!context || context.crownPrintPresent !== true) return "ask";
  if (context.crownState && context.crownState.fresh === false) return "refresh";
  return "none";
}

/** Convenience: may Wynn put CrownState questions in front of this shopper? */
export const shouldCollectCrownState = (context) => crownStateAction(context) === "ask";

/**
 * True for the markers that mean "the handoff didn't complete" — as opposed to
 * a verdict about the shopper. These get the reconnect panel, never the
 * create-and-pay intro: a shopper who already owns a CrownPrint must never be
 * shown a price again because of a failed round trip.
 */
export function isRecoveryMarker(requested) {
  return requested === EXPIRED || requested === ERROR || requested === SESSION_LOST;
}

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
