// Shop by CrownPrint™ — the CrownPrint code vocabulary.
//
// WHAT THIS IS
// Hair Wellness Lab (HWL) hands every shopper a CrownPrint code on their
// CrownPrint Intelligence Report™:
//
//     CrownPrint code: P2-D3-T3-S2-E2
//
// Five CrownPrint Core axes, each a level. Those five are the *stable* part of a
// CrownPrint — HWL states plainly that the Core "stays relatively stable" while
// the CrownState (current style, scalp right now, primary concern, goal) changes
// with styles, seasons, and routines. That is why the code carries the Core only,
// and why /crownprint asks for the CrownState on the page instead of expecting it
// to be typed in.
//
// WHAT THIS IS NOT
// This module reads a code the shopper already owns. It never mints one, never
// scores one, and never reproduces HWL's Intelligence Report, its evidence
// architecture, or the Wynn Essentials Match™ engine — all of which stay at HWL
// (see lib/crownprint.ts and docs/wynn-essentials-integration.md). Wynn maps a
// Core + CrownState onto its OWN catalog, which is Wynn's to reason about.
//
// Deliberately plain, dependency-free TypeScript (no React, no next/*, no env)
// so it is directly unit-testable — see tests/crownprint-code.test.mjs.

// ---------------------------------------------------------------------------
// CrownPrint Core — the five axes carried by the code.
// ---------------------------------------------------------------------------

export type CoreAxisId = "porosity" | "density" | "thickness" | "scalp" | "elasticity";

export type CoreLevel = {
  /** The level as it appears in the code: P1 / P2 / P3. */
  level: number;
  /** Stable machine value used by the fit engine. */
  value: string;
  /** HWL's own label for this level, as printed on the report. */
  label: string;
  /** One consumer-safe line about what it means, in Wynn's voice. */
  blurb: string;
};

export type CoreAxis = {
  id: CoreAxisId;
  /** The code letter: P, D, T, S, E. */
  letter: string;
  label: string;
  /** Words a shopper might type instead of the letter ("porosity: high"). */
  keywords: string[];
  /** Word forms accepted for a level once the axis is known. */
  levels: (CoreLevel & { words: string[] })[];
};

// Levels mirror the CrownPrint Intelligence Report exactly: P2 is "Medium
// porosity", D3 is "High density", T3 is "Coarse", S2 is "Balanced scalp",
// E2 is "Normal elasticity". Scalp carries a fourth level because a sensitive
// scalp type is reported separately from dry, balanced, and oily.
export const CORE_AXES: CoreAxis[] = [
  {
    id: "porosity",
    letter: "P",
    label: "Porosity",
    keywords: ["POROSITY", "POR", "PORO"],
    levels: [
      { level: 1, value: "low", label: "Low porosity", blurb: "Moisture takes its time getting in — and resists heavy layers once it's there.", words: ["LOW", "LO", "L"] },
      { level: 2, value: "medium", label: "Medium porosity", blurb: "Balanced behavior — moisture moves in and stays without much fuss.", words: ["MEDIUM", "MED", "M", "BALANCED", "NORMAL"] },
      { level: 3, value: "high", label: "High porosity", blurb: "Moisture gets in quickly and leaves just as quickly, so sealing matters.", words: ["HIGH", "HI", "H"] },
    ],
  },
  {
    id: "density",
    letter: "D",
    label: "Density",
    keywords: ["DENSITY", "DEN", "DENS"],
    levels: [
      { level: 1, value: "low", label: "Low density", blurb: "Fewer strands across the scalp, so weight and tension show quickly.", words: ["LOW", "LO", "L", "THIN", "SPARSE"] },
      { level: 2, value: "medium", label: "Medium density", blurb: "A middle amount of hair — most routines distribute evenly.", words: ["MEDIUM", "MED", "M", "NORMAL"] },
      { level: 3, value: "high", label: "High density", blurb: "Many strands packed together, so product and water can struggle to reach every layer.", words: ["HIGH", "HI", "H", "THICK", "DENSE"] },
    ],
  },
  {
    id: "thickness",
    letter: "T",
    label: "Strand Thickness",
    keywords: ["THICKNESS", "STRAND", "STRANDTHICKNESS", "WIDTH", "THI"],
    levels: [
      { level: 1, value: "fine", label: "Fine", blurb: "A smaller diameter per hair — easily weighed down, and less margin for tension.", words: ["FINE", "LOW", "L", "1"] },
      { level: 2, value: "medium", label: "Medium", blurb: "A middle strand diameter — flexible across product weights.", words: ["MEDIUM", "MED", "M", "NORMAL"] },
      { level: 3, value: "coarse", label: "Coarse", blurb: "A larger diameter per hair — can resist product and wants richer moisture and more time to absorb.", words: ["COARSE", "HIGH", "HI", "H", "THICK"] },
    ],
  },
  {
    id: "scalp",
    letter: "S",
    label: "Scalp Type",
    keywords: ["SCALP", "SCA"],
    levels: [
      { level: 1, value: "dry", label: "Dry scalp", blurb: "A scalp that tends toward dryness, tightness, or flaking between washes.", words: ["DRY", "FLAKY", "LOW", "L"] },
      { level: 2, value: "balanced", label: "Balanced scalp", blurb: "Comfortable between reasonable wash intervals — neither very dry nor very oily.", words: ["BALANCED", "NORMAL", "MEDIUM", "MED", "M"] },
      { level: 3, value: "oily", label: "Oily scalp", blurb: "A scalp that gets oily or weighed down sooner after wash day.", words: ["OILY", "OIL", "GREASY", "HIGH", "HI", "H"] },
      { level: 4, value: "sensitive", label: "Sensitive scalp", blurb: "A scalp that reacts easily — tenderness, itching, or irritation come on quickly.", words: ["SENSITIVE", "SENS", "REACTIVE", "IRRITATED"] },
    ],
  },
  {
    id: "elasticity",
    letter: "E",
    label: "Elasticity",
    keywords: ["ELASTICITY", "ELA", "ELAS", "STRETCH"],
    levels: [
      { level: 1, value: "low", label: "Low elasticity", blurb: "Strands stretch and snap rather than springing back — a breakage signal.", words: ["LOW", "LO", "L", "POOR"] },
      { level: 2, value: "normal", label: "Normal elasticity", blurb: "A healthy stretch-and-return — hair handles routine manipulation reasonably well.", words: ["NORMAL", "MEDIUM", "MED", "M", "GOOD"] },
      { level: 3, value: "high", label: "High elasticity", blurb: "Plenty of stretch — usually well-conditioned, and rarely short on softness.", words: ["HIGH", "HI", "H"] },
    ],
  },
];

// ---------------------------------------------------------------------------
// CrownState — the part that changes, so it is never in the code. These mirror
// the CrownState section of the CrownPrint Intelligence Report field for field.
// ---------------------------------------------------------------------------

export type StateFieldId = "style" | "stage" | "scalpNow" | "concern" | "goal";

export type StateOption = { value: string; label: string };
export type StateField = {
  id: StateFieldId;
  label: string;
  question: string;
  /** Short URL key, so a shared link stays readable. */
  param: string;
  options: StateOption[];
};

export const STATE_FIELDS: StateField[] = [
  {
    id: "style",
    label: "Current style",
    question: "How are you wearing your hair right now?",
    param: "style",
    options: [
      { value: "braids", label: "Braids" },
      { value: "locs", label: "Locs" },
      { value: "twists", label: "Twists" },
      { value: "wig", label: "Wig or weave" },
      { value: "natural", label: "Loose natural" },
      { value: "silkpress", label: "Silk press or straightened" },
    ],
  },
  {
    id: "stage",
    label: "Protective stage",
    question: "If you're in a protective style, where are you in it?",
    param: "stage",
    options: [
      { value: "fresh", label: "Fresh install" },
      { value: "mid", label: "Mid-wear" },
      { value: "takedown-soon", label: "Nearing takedown" },
      { value: "post-takedown", label: "Just took it down" },
      { value: "none", label: "Not in a protective style" },
    ],
  },
  {
    id: "scalpNow",
    label: "Scalp right now",
    question: "What is your scalp doing this week?",
    param: "scalp",
    options: [
      { value: "comfortable", label: "Comfortable" },
      { value: "tender", label: "Tender" },
      { value: "itchy", label: "Itchy" },
      { value: "flaky", label: "Dry or flaky" },
      { value: "oily", label: "Oily or weighed down" },
    ],
  },
  {
    id: "concern",
    label: "Primary concern",
    question: "What is your main concern right now?",
    param: "concern",
    options: [
      { value: "dryness", label: "Dryness" },
      { value: "breakage", label: "Breakage" },
      { value: "shedding", label: "Shedding or thinning" },
      { value: "scalp", label: "Scalp discomfort" },
      { value: "buildup", label: "Buildup" },
      { value: "frizz", label: "Frizz" },
      { value: "definition", label: "Definition" },
    ],
  },
  {
    id: "goal",
    label: "Current goal",
    question: "What are you working toward?",
    param: "goal",
    options: [
      { value: "maintenance", label: "General healthy hair maintenance" },
      { value: "growth", label: "Growth and length retention" },
      { value: "repair", label: "Recovery and repair" },
      { value: "definition", label: "Definition and styling" },
      { value: "protective", label: "Protective-style care" },
    ],
  },
];

// ---------------------------------------------------------------------------
// The profile the rest of Wynn reasons about.
// ---------------------------------------------------------------------------

export type CrownPrintCore = Partial<Record<CoreAxisId, string>>;
export type CrownStateInput = Partial<Record<StateFieldId, string>>;
export type CrownPrintProfile = { core: CrownPrintCore; state: CrownStateInput };

export type RecognizedSignal = { axis: CoreAxisId; letter: string; level: number; value: string; label: string; blurb: string };

export type ParsedCrownPrint = {
  /** The Core axes we could read, in report order. */
  recognized: RecognizedSignal[];
  /** Tokens we did not understand — surfaced, never silently swallowed. */
  unrecognized: string[];
  core: CrownPrintCore;
  /** The code re-emitted in HWL's canonical form, e.g. "P2-D3-T3-S2-E2". */
  code: string;
  /** True when at least one Core axis was read, so we have something to match on. */
  usable: boolean;
};

// Tokens that are part of how people write a CrownPrint down but carry no signal.
const NOISE = new Set([
  "CROWNPRINT", "CROWN", "PRINT", "CODE", "CP", "MY", "IS", "THE", "HAIR", "WELLNESS",
  "LAB", "HWL", "WYNN", "ESSENTIALS", "REPORT", "INTELLIGENCE", "TYPE", "V1", "V",
]);

const AXIS_BY_LETTER = new Map(CORE_AXES.map((a) => [a.letter, a]));
const AXIS_BY_KEYWORD = new Map<string, CoreAxis>();
for (const axis of CORE_AXES) {
  AXIS_BY_KEYWORD.set(axis.label.toUpperCase().replace(/[^A-Z]/g, ""), axis);
  for (const kw of axis.keywords) AXIS_BY_KEYWORD.set(kw, axis);
}

const signal = (axis: CoreAxis, lvl: CoreLevel): RecognizedSignal => ({
  axis: axis.id,
  letter: axis.letter,
  level: lvl.level,
  value: lvl.value,
  label: lvl.label,
  blurb: lvl.blurb,
});

/**
 * Read a CrownPrint code.
 *
 * Tolerant on purpose: a shopper is retyping something off a PDF, so casing,
 * separators, spacing, axis order, and missing axes all parse. "P2-D3-T3-S2-E2",
 * "p2 d3 t3 s2 e2", "P2D3T3S2E2", the report's own filename, and
 * "porosity high, density low" all resolve to the same Core.
 *
 * Anything genuinely unreadable comes back in `unrecognized` so the page can say
 * what it could not read instead of failing the whole code — the one behavior
 * this page exists to end. A code with no readable axis is `usable: false`, and
 * the page then asks the shopper to pick their Core rather than guessing at it.
 */
export function parseCrownPrintCode(raw: unknown): ParsedCrownPrint {
  const found = new Map<CoreAxisId, RecognizedSignal>();
  const unrecognized: string[] = [];

  if (typeof raw === "string" && raw.trim()) {
    // Bounded before tokenizing: this value arrives from a URL and a text input.
    const text = raw.trim().slice(0, 240).toUpperCase();
    // Split "P2D3T3S2E2" into letter+digit pairs so the run-together form parses,
    // then tokenize on anything that is not alphanumeric.
    const tokens = text
      .replace(/([A-Z])(\d)/g, " $1$2 ")
      .split(/[^A-Z0-9]+/)
      .filter(Boolean)
      .slice(0, 32);

    let pending: CoreAxis | null = null;
    for (const token of tokens) {
      if (NOISE.has(token)) { pending = null; continue; }

      // "P2" — the canonical form.
      const pair = /^([A-Z])(\d{1,2})$/.exec(token);
      if (pair) {
        const axis = AXIS_BY_LETTER.get(pair[1]);
        const lvl = axis?.levels.find((l) => l.level === Number(pair[2]));
        if (axis && lvl) {
          if (!found.has(axis.id)) found.set(axis.id, signal(axis, lvl));
          pending = null;
          continue;
        }
        unrecognized.push(token);
        pending = null;
        continue;
      }

      // "POROSITY" — an axis name; the next token should be its level.
      const named = AXIS_BY_KEYWORD.get(token);
      if (named) { pending = named; continue; }

      // "HIGH" following an axis name, or a bare level number after one.
      if (pending) {
        const lvl =
          pending.levels.find((l) => l.words.includes(token)) ||
          pending.levels.find((l) => String(l.level) === token);
        if (lvl) {
          if (!found.has(pending.id)) found.set(pending.id, signal(pending, lvl));
          pending = null;
          continue;
        }
      }

      unrecognized.push(token);
      pending = null;
    }
  }

  // Report order (P, D, T, S, E), never the order they happened to be typed in.
  const recognized = CORE_AXES.map((a) => found.get(a.id)).filter((s): s is RecognizedSignal => Boolean(s));
  const core: CrownPrintCore = {};
  for (const s of recognized) core[s.axis] = s.value;

  return {
    recognized,
    unrecognized: unrecognized.slice(0, 8),
    core,
    code: formatCrownPrintCode(core),
    usable: recognized.length > 0,
  };
}

/** Emit a Core in HWL's canonical code form. Axes we don't have are left out. */
export function formatCrownPrintCode(core: CrownPrintCore): string {
  return CORE_AXES.map((axis) => {
    const value = core[axis.id];
    const lvl = axis.levels.find((l) => l.value === value);
    return lvl ? `${axis.letter}${lvl.level}` : null;
  })
    .filter(Boolean)
    .join("-");
}

/** The signals for a Core, in report order — used to explain what we read. */
export function describeCore(core: CrownPrintCore): RecognizedSignal[] {
  return CORE_AXES.map((axis) => {
    const lvl = axis.levels.find((l) => l.value === core[axis.id]);
    return lvl ? signal(axis, lvl) : null;
  }).filter((s): s is RecognizedSignal => Boolean(s));
}

/**
 * Read a Core from explicit per-axis params (`?porosity=high`), which is what
 * the on-page CrownPrint builder submits and what a shopper without their code
 * ends up using. Values are matched against this build's own level list, so a
 * hand-edited or stale link can never inject an axis value we don't know.
 */
export function normalizeCore(input: Record<string, unknown> | null | undefined): CrownPrintCore {
  const core: CrownPrintCore = {};
  if (!input) return core;
  for (const axis of CORE_AXES) {
    const raw = input[axis.id];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string") continue;
    const lvl = axis.levels.find((l) => l.value === value.trim().toLowerCase());
    if (lvl) core[axis.id] = lvl.value;
  }
  return core;
}

/** Keep only CrownState values this build knows, so a stale link can't inject one. */
export function normalizeCrownState(input: Record<string, unknown> | null | undefined): CrownStateInput {
  const state: CrownStateInput = {};
  if (!input) return state;
  for (const field of STATE_FIELDS) {
    const raw = input[field.param] ?? input[field.id];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string") continue;
    const option = field.options.find((o) => o.value === value.trim().toLowerCase());
    if (option) state[field.id] = option.value;
  }
  return state;
}

/** The query string that reproduces a profile — what "share my CrownPrint" copies. */
export function profileToQuery(profile: CrownPrintProfile): string {
  const params = new URLSearchParams();
  const code = formatCrownPrintCode(profile.core);
  if (code) params.set("cp", code);
  for (const field of STATE_FIELDS) {
    const value = profile.state[field.id];
    if (value) params.set(field.param, value);
  }
  return params.toString();
}

export const labelForState = (id: StateFieldId, value: string | undefined): string | undefined =>
  STATE_FIELDS.find((f) => f.id === id)?.options.find((o) => o.value === value)?.label;
