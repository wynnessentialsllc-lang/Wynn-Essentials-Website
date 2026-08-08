// Shop by CrownPrint™ — the customer-facing Match Intelligence UI.
//
// Two pieces, shared by both CrownPrint surfaces so the explanation can never
// drift between them:
//
//   <MatchLegend/>      runs ABOVE the recommendation results and defines Strong,
//                       Good, and Conditional — including, in as many words, that
//                       these describe fit rather than product quality.
//   <MatchReasoning/>   runs INSIDE every product card and explains why THAT
//                       product landed in THAT class for THIS shopper.
//
// All copy and all reasoning live in lib/crownprint-match-intelligence.ts. This
// file only lays it out, so the words on the page are the same words the tests
// assert against.

import {
  MATCH_CLASS_DEFINITIONS,
  MATCH_CLASS_ORDER,
  MATCH_LEGEND,
  legendContextNote,
  type GuidanceSource,
  type MatchRationale,
} from "../lib/crownprint-match-intelligence";

/**
 * "How Your CrownPrint Matches Work" — rendered before the results on both
 * /crownprint and /shop-by-crownprint.
 *
 * SHAPE
 * Three rows, one per class: the badge exactly as it appears on the cards below,
 * plus a one-line meaning. That is the whole legend in its resting state — it
 * reads in a couple of seconds on a phone and does not push the products off the
 * screen for someone coming back to matches they have already seen.
 *
 * The full definitions and the education that goes with them sit behind a
 * "How matches work" control. A native <details> is used rather than React
 * state on purpose: the content stays in the document whether it is open or
 * shut, so it is still found by search, still read by assistive tech, and still
 * present when JavaScript hasn't loaded. Collapsed is not the same as absent.
 *
 * `source` is what keeps the legend honest: a connected CrownPrint 360 says so,
 * and the manual Core fallback states plainly that it is working with less
 * context and is not a 360-level verdict. That line stays outside the collapse —
 * a shopper should never have to open anything to find out how much context
 * their results were built from.
 */
export function MatchLegend({ source }: { source: GuidanceSource }) {
  return (
    <section className="cp-legend" aria-labelledby="cp-legend-heading">
      <p className="eyebrow">{MATCH_LEGEND.eyebrow}</p>
      <h2 id="cp-legend-heading">{MATCH_LEGEND.title}</h2>

      <ul className="cp-legend-rows">
        {MATCH_CLASS_ORDER.map((cls) => {
          const definition = MATCH_CLASS_DEFINITIONS[cls];
          return (
            <li key={cls} className={`cp-legend-row cp-legend-row-${cls}`}>
              <span className={`cp-legend-chip cp-legend-chip-${cls}`}>{definition.title}</span>
              <span className="cp-legend-row-text">{definition.headline}</span>
            </li>
          );
        })}
      </ul>

      <details className="cp-legend-more">
        <summary>
          <span className="cp-legend-more-label">{MATCH_LEGEND.expandLabel}</span>
          <span className="cp-legend-more-hint">{MATCH_LEGEND.expandHint}</span>
        </summary>

        <div className="cp-legend-detail">
          <p className="cp-legend-lead">{MATCH_LEGEND.intro}</p>

          <div className="cp-legend-grid">
            {MATCH_CLASS_ORDER.map((cls) => {
              const definition = MATCH_CLASS_DEFINITIONS[cls];
              return (
                <article key={cls} className={`cp-legend-card cp-legend-card-${cls}`}>
                  <h3>{definition.title}</h3>
                  <p><b>{definition.headline}</b> {definition.definition}</p>
                </article>
              );
            })}
          </div>

          <div className="cp-legend-notes">
            <div>
              <h4>{MATCH_LEGEND.qualityHeading}</h4>
              <p>{MATCH_LEGEND.quality}</p>
            </div>
            <div>
              <h4>{MATCH_LEGEND.changeHeading}</h4>
              <p>{MATCH_LEGEND.change}</p>
            </div>
            <div>
              <h4>{MATCH_LEGEND.readingHeading}</h4>
              <p>{MATCH_LEGEND.reading}</p>
            </div>
          </div>

          <p className="cp-fine">{MATCH_LEGEND.noNumbers}</p>
        </div>
      </details>

      <p className="cp-legend-source">{legendContextNote(source)}</p>
    </section>
  );
}

/**
 * The per-card explanation. Every card carries one — a match with no reasoning
 * behind it is a label, and a label is what this whole feature exists to replace.
 *
 * A Conditional Match renders three extra lines by construction: what makes it
 * relevant, when to consider it, and when it may not be necessary.
 */
export function MatchReasoning({ rationale }: { rationale: MatchRationale }) {
  return (
    <div className={`cp-why cp-why-${rationale.matchClass}`}>
      <p className="cp-why-heading">{rationale.heading}</p>
      {rationale.signals.length > 0 && (
        <p className="cp-why-signals">
          <b>Your signals:</b> {rationale.signals.join(" · ")}
        </p>
      )}
      <p className="cp-why-text">{rationale.explanation}</p>
      {rationale.condition && <p className="cp-why-line">{rationale.condition}</p>}
      {rationale.whenItApplies && <p className="cp-why-line">{rationale.whenItApplies}</p>}
      {rationale.whenItMayNotBeNeeded && <p className="cp-why-line">{rationale.whenItMayNotBeNeeded}</p>}
      <p className="cp-why-context">{rationale.contextNote}</p>
    </div>
  );
}
