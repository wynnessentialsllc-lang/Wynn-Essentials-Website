import assert from "node:assert/strict";
import test from "node:test";

import {
  CORE_AXES,
  STATE_FIELDS,
  describeCore,
  formatCrownPrintCode,
  normalizeCore,
  normalizeCrownState,
  parseCrownPrintCode,
  profileToQuery,
} from "../lib/crownprint-code.ts";

// ---------------------------------------------------------------------------
// The CrownPrint code vocabulary.
//
// The reference fixture is a real CrownPrint Intelligence Report™:
//
//     CrownPrint code: P2-D3-T3-S2-E2
//     P2 · Porosity: Medium porosity
//     D3 · Density: High density
//     T3 · Strand Thickness: Coarse
//     S2 · Scalp Type: Balanced
//     E2 · Elasticity: Normal elasticity
//
// Everything below asserts against that, because a shopper retyping their own
// report is the entire point of the page — and the failure mode we are removing
// is a code that "couldn't be verified".
// ---------------------------------------------------------------------------

const REPORT_CODE = "P2-D3-T3-S2-E2";

test("1. the report's own code parses to the report's own five axes", () => {
  const parsed = parseCrownPrintCode(REPORT_CODE);
  assert.equal(parsed.usable, true);
  assert.deepEqual(parsed.unrecognized, []);
  assert.deepEqual(parsed.core, {
    porosity: "medium",
    density: "high",
    thickness: "coarse",
    scalp: "balanced",
    elasticity: "normal",
  });
  assert.equal(parsed.code, REPORT_CODE, "the canonical re-emit must round-trip");
  // The human labels must match the report verbatim, or the readout lies.
  const labels = parsed.recognized.map((s) => s.label);
  assert.deepEqual(labels, ["Medium porosity", "High density", "Coarse", "Balanced scalp", "Normal elasticity"]);
});

test("2. casing, spacing, separators, and run-together forms all parse the same", () => {
  const variants = [
    "p2-d3-t3-s2-e2",
    "P2 D3 T3 S2 E2",
    "P2D3T3S2E2",
    "  P2/D3/T3/S2/E2  ",
    "CrownPrint code: P2-D3-T3-S2-E2",
    "CrownPrintIntelligenceReportP2D3T3S2E2", // the report's own filename
  ];
  for (const raw of variants) {
    assert.equal(parseCrownPrintCode(raw).code, REPORT_CODE, `"${raw}" must parse to ${REPORT_CODE}`);
  }
});

test("3. axis order in the input never changes the canonical order out", () => {
  assert.equal(parseCrownPrintCode("E2-S2-T3-D3-P2").code, REPORT_CODE);
});

test("4. a partial code is usable — we match on what we were given", () => {
  const parsed = parseCrownPrintCode("P3-T1");
  assert.equal(parsed.usable, true);
  assert.deepEqual(parsed.core, { porosity: "high", thickness: "fine" });
  assert.equal(parsed.code, "P3-T1");
});

test("5. an unreadable token is reported, not fatal", () => {
  const parsed = parseCrownPrintCode("P2-X9-D1");
  assert.equal(parsed.usable, true, "one bad token must not discard the whole code");
  assert.deepEqual(parsed.core, { porosity: "medium", density: "low" });
  assert.deepEqual(parsed.unrecognized, ["X9"]);
});

test("6. an out-of-range level is rejected rather than clamped", () => {
  const parsed = parseCrownPrintCode("P9-D3");
  assert.equal(parsed.core.porosity, undefined, "P9 is not a porosity level");
  assert.equal(parsed.core.density, "high");
  assert.deepEqual(parsed.unrecognized, ["P9"]);
});

test("7. nothing readable resolves to unusable — never a silent empty match", () => {
  for (const raw of ["", "   ", "hello there", null, undefined, 42]) {
    const parsed = parseCrownPrintCode(raw);
    assert.equal(parsed.usable, false);
    assert.deepEqual(parsed.core, {});
    assert.equal(parsed.code, "");
  }
});

test("8. axis words are understood when someone types instead of pasting", () => {
  const parsed = parseCrownPrintCode("porosity high, density low, elasticity normal");
  assert.deepEqual(parsed.core, { porosity: "high", density: "low", elasticity: "normal" });
  assert.equal(parsed.code, "P3-D1-E2");
});

test("9. the first reading of an axis wins, so a duplicate can't overwrite it", () => {
  assert.equal(parseCrownPrintCode("P1-P3").core.porosity, "low");
});

test("10. explicit axis params are validated against this build's own levels", () => {
  assert.deepEqual(normalizeCore({ porosity: "high", density: "LOW" }), { porosity: "high", density: "low" });
  // A hand-edited or stale link can never inject a value we don't know.
  assert.deepEqual(normalizeCore({ porosity: "extreme", thickness: "", scalp: 7 }), {});
  assert.deepEqual(normalizeCore(null), {});
});

test("11. CrownState is whitelisted the same way", () => {
  assert.deepEqual(
    normalizeCrownState({ style: "braids", stage: "takedown-soon", scalp: "tender", concern: "dryness", goal: "maintenance" }),
    { style: "braids", stage: "takedown-soon", scalpNow: "tender", concern: "dryness", goal: "maintenance" },
  );
  assert.deepEqual(normalizeCrownState({ style: "mohawk", concern: "vibes" }), {});
});

test("12. a profile round-trips through its shareable query string", () => {
  const profile = {
    core: { porosity: "medium", density: "high", thickness: "coarse", scalp: "balanced", elasticity: "normal" },
    state: { style: "braids", concern: "dryness" },
  };
  const query = profileToQuery(profile);
  const params = new URLSearchParams(query);
  assert.equal(params.get("cp"), REPORT_CODE);
  assert.equal(params.get("style"), "braids");
  assert.equal(params.get("concern"), "dryness");
  assert.deepEqual(parseCrownPrintCode(params.get("cp")).core, profile.core);
});

test("13. describeCore explains every axis it was given, in report order", () => {
  const described = describeCore(parseCrownPrintCode(REPORT_CODE).core);
  assert.deepEqual(described.map((s) => `${s.letter}${s.level}`), ["P2", "D3", "T3", "S2", "E2"]);
  for (const s of described) assert.ok(s.blurb.length > 20, `${s.letter} needs a real explanation`);
});

test("14. the vocabulary itself is internally consistent", () => {
  const letters = CORE_AXES.map((a) => a.letter);
  assert.deepEqual(letters, ["P", "D", "T", "S", "E"], "the five Core axes, in the report's order");
  assert.equal(new Set(letters).size, letters.length, "code letters must be unique");
  for (const axis of CORE_AXES) {
    const levels = axis.levels.map((l) => l.level);
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b), `${axis.letter} levels must ascend`);
    assert.equal(new Set(axis.levels.map((l) => l.value)).size, axis.levels.length);
    // Every level must be expressible in a code and readable back out of one.
    for (const lvl of axis.levels) {
      const code = formatCrownPrintCode({ [axis.id]: lvl.value });
      assert.equal(code, `${axis.letter}${lvl.level}`);
      assert.equal(parseCrownPrintCode(code).core[axis.id], lvl.value);
    }
  }
  // CrownState fields must have unique URL keys or a shared link loses one.
  const params = STATE_FIELDS.map((f) => f.param);
  assert.equal(new Set(params).size, params.length);
});

test("15. curl pattern is deliberately NOT a Core axis", () => {
  // CrownPrint decides product fit on how hair behaves, not on a pattern label —
  // so "4C" is not a CrownPrint signal, and pretending to read one would be
  // inventing data the shopper's report never gave us.
  const parsed = parseCrownPrintCode("4C");
  assert.equal(parsed.usable, false);
  assert.ok(parsed.unrecognized.includes("4C"));
});
