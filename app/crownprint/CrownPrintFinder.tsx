"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trackAddToCart, trackCrownPrintEvent } from "../analytics";
import {
  CORE_AXES,
  STATE_FIELDS,
  formatCrownPrintCode,
  type CoreAxisId,
  type CrownPrintCore,
  type CrownStateInput,
  type RecognizedSignal,
} from "../../lib/crownprint-code";
import type { LabelledPoint, MatchClass, WhatToLookFor } from "../../lib/crownprint-fit";
import type { GuidanceSource, MatchRationale } from "../../lib/crownprint-match-intelligence";
import { MatchLegend, MatchReasoning } from "../MatchIntelligence";

export type FitCard = {
  slug: string;
  name: string;
  subtitle: string;
  price: number | null;
  image: { src: string; alt: string } | null;
  simple: boolean;          // no color/variant choice → can go straight to the bag
  matchClass: MatchClass;
  why: string;
  need: string;
  whenToUse: string;
  caution?: string;
  limitedBy?: string[];
  keyIngredients: string[];
  /** Why THIS product is in THIS class for THIS shopper. Never optional. */
  rationale: MatchRationale;
};

const money = (v: number | null) =>
  v == null ? "Price to be confirmed" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

const CLASS_LABEL: Record<MatchClass, string> = {
  strong: "Strong CrownPrint Match",
  good: "Good CrownPrint Match",
  conditional: "Conditional Match",
};

// Cart shape and key must match the storefront (app/WynnShop.tsx) so anything
// added here lands in the same bag and checks out through the same Stripe path.
type CartItem = { slug: string; quantity: number; color?: string; variantId?: string };

function addToBag(slug: string) {
  try {
    const cart: CartItem[] = JSON.parse(localStorage.getItem("wynnCart") || "[]");
    const existing = cart.find((i) => i.slug === slug && !i.color && !i.variantId);
    const next = existing
      ? cart.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i))
      : [...cart, { slug, quantity: 1 }];
    localStorage.setItem("wynnCart", JSON.stringify(next));
  } catch { /* storage unavailable — silently skip */ }
}

// Every card carries the same things, in the same order: the match class, which
// need it serves, the classification-specific reasoning built from this
// shopper's own CrownPrint signals, when to use it, and any caveat. A caveat is
// never dropped to make a card look better, and no card ever shows a class
// without the reasoning that produced it.
function MatchCard({ card, onAdd }: { card: FitCard; onAdd: (c: FitCard) => void }) {
  return (
    <article className="cp-card">
      <Link
        href={`/products/${card.slug}`}
        className="cp-card-art"
        aria-label={`Shop ${card.name}`}
        onClick={() => trackCrownPrintEvent("crownprint_type_product_clicked", { contentId: card.slug })}
      >
        {card.image ? (
          <img src={card.image.src} alt={card.image.alt} width={800} height={800} loading="lazy" />
        ) : (
          <span className="cp-card-art-fallback" aria-hidden="true">{card.name}</span>
        )}
        <span className={`cp-badge cp-badge-${card.matchClass}`}>{CLASS_LABEL[card.matchClass]}</span>
      </Link>
      <div className="cp-card-body">
        <p className="eyebrow">{card.subtitle}</p>
        <h4>{card.name}</h4>
        <strong className="cp-card-price">{money(card.price)}</strong>
        <p className="cp-card-need"><b>Need it serves:</b> {card.need}</p>
        <MatchReasoning rationale={card.rationale} />
        <p className="cp-card-usage"><b>When to use it:</b> {card.whenToUse}</p>
        {card.keyIngredients.length > 0 && (
          <p className="cp-card-ingredients"><b>From its ingredient list:</b> {card.keyIngredients.join(" · ")}</p>
        )}
        {/* A Conditional Match already carries its caveat inside "when it may not
            be necessary", which is where it does the most good. Every other class
            keeps it as its own line — it is never dropped, only relocated. */}
        {card.caution && card.matchClass !== "conditional" && (
          <p className="cp-card-caution"><b>Caveat:</b> {card.caution}</p>
        )}
        {card.limitedBy?.length ? (
          <p className="cp-card-limited">
            <b>Limited context:</b> this one is judged partly on {card.limitedBy.join(" and ")}, which your code
            didn&rsquo;t include — so we&rsquo;ve held it back from a strong match rather than assume.
          </p>
        ) : null}
        <div className="cp-card-actions">
          {card.simple && card.price != null ? (
            <button className="button full" onClick={() => onAdd(card)}>Add to Cart</button>
          ) : null}
          <Link
            href={`/products/${card.slug}`}
            className="outline-button full"
            onClick={() => trackCrownPrintEvent("crownprint_type_product_clicked", { contentId: card.slug })}
          >
            Shop Product
          </Link>
        </div>
      </div>
    </article>
  );
}

function MatchGroup({ cls, cards, onAdd }: { cls: MatchClass; cards: FitCard[]; onAdd: (c: FitCard) => void }) {
  const group = cards.filter((c) => c.matchClass === cls);
  if (!group.length) return null;
  return (
    <div className="cp-group">
      <h3 className={`cp-group-heading cp-group-${cls}`}>{CLASS_LABEL[cls].toUpperCase()}</h3>
      <div className="cp-grid">{group.map((c) => <MatchCard key={c.slug} card={c} onAdd={onAdd} />)}</div>
    </div>
  );
}

/** A labelled, numbered list — used for priorities and for routine functions. */
function PointList({ points, numbered }: { points: LabelledPoint[]; numbered?: boolean }) {
  return (
    <ol className={`cp-points${numbered ? " cp-points-numbered" : ""}`}>
      {points.map((p, i) => (
        <li key={p.label}>
          {numbered && <span className="cp-points-index" aria-hidden="true">#{i + 1}</span>}
          <b>{p.label}</b>
          <span>{p.detail}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Honest fit.
 *
 * Three situations land here: the collection has nothing for this CrownPrint at
 * all, it has products that fit but none that stand out, or it fits well and
 * there is simply a gap we don't cover. All of them get told plainly, and all of
 * them get the same thing in return — what this CrownPrint needs, and what to
 * look for on any label, including labels that aren't ours. Sending someone away
 * with useful guidance is a better outcome than selling them the wrong bottle.
 */
function HonestFit({ guidance, noFit, noStrongMatch }: { guidance: WhatToLookFor; noFit: boolean; noStrongMatch: boolean }) {
  return (
    <section className="cp-nomatch" aria-labelledby="cp-honest-heading">
      <p className="eyebrow">{noFit ? "HONEST FIT" : "WHAT TO LOOK FOR ELSEWHERE"}</p>
      <h3 id="cp-honest-heading">
        {noFit
          ? "Unfortunately, your CrownPrint didn't match any Wynn Essentials product we currently offer."
          : noStrongMatch
            ? "Nothing in the collection is a standout for this CrownPrint right now."
            : "Whatever you buy next — from us or anyone else — here's what your CrownPrint points to."}
      </h3>
      <p className="cp-nomatch-lead">
        {noFit
          ? "We'd rather tell you that than sell you something that isn't right for your hair. Here's what your CrownPrint does point to — use it wherever you shop."
          : noStrongMatch
            ? "The products above genuinely fit, but none is the standout answer for your axes. Here's what to look for so you can fill the gap wherever you find it."
            : "This guidance is brand-agnostic on purpose. It describes what to look for on a label, so you can judge any product — ours included — against your own axes."}
      </p>
      <div className="cp-nomatch-grid">
        <div><h4>What your hair needs right now</h4><p>{guidance.hairNeed}</p></div>
        <div><h4>Product type to look for</h4><p>{guidance.productType}</p></div>
        {guidance.formulationCharacteristics.length > 0 && (
          <div><h4>Formulation characteristics to look for</h4><ul>{guidance.formulationCharacteristics.map((x) => <li key={x}>{x}</li>)}</ul></div>
        )}
        {guidance.ingredientFunctions.length > 0 && (
          <div><h4>Ingredient functions to look for on the label</h4><ul>{guidance.ingredientFunctions.map((x) => <li key={x}>{x}</li>)}</ul></div>
        )}
        {guidance.whatMayNotFit.length > 0 && (
          <div><h4>What may not fit your CrownPrint</h4><ul>{guidance.whatMayNotFit.map((x) => <li key={x}>{x}</li>)}</ul></div>
        )}
        <div><h4>Why this matters</h4><p>{guidance.whyThisMatters}</p></div>
      </div>
      <p className="cp-nomatch-lead">
        Ingredient lists are ordered by concentration, so where something sits on the list matters as much as whether
        it&rsquo;s on it at all. Patch test anything new, and give one product two weeks before you judge it.
      </p>
      {noFit && (
        <div className="actions">
          <Link className="outline-button" href="/#shop">Browse the full collection anyway</Link>
        </div>
      )}
    </section>
  );
}

/**
 * The CrownPrint entry form.
 *
 * It is a plain GET form pointed at this same page, so results are server
 * rendered, shareable, bookmarkable, and work with JavaScript switched off. The
 * code box and the axis pickers are two ways into the same Core: whatever the
 * pickers say wins, and a shopper with no code at all can still get matched.
 */
function Entry({
  rawCode,
  core,
  state,
  open,
  unrecognized,
}: {
  rawCode: string;
  core: CrownPrintCore;
  state: CrownStateInput;
  open: boolean;
  unrecognized: string[];
}) {
  const [code, setCode] = useState(rawCode);
  const [picked, setPicked] = useState<CrownPrintCore>(core);
  const [manual, setManual] = useState(open && !rawCode);

  // Shown live so a shopper building their Core by hand ends up holding the same
  // code Hair Wellness Lab would have printed for them.
  const builtCode = useMemo(() => formatCrownPrintCode(picked), [picked]);

  const setAxis = (id: CoreAxisId, value: string) =>
    setPicked((p) => ({ ...p, [id]: p[id] === value ? undefined : value }));

  return (
    <form className="cp-entry" method="get" action="/crownprint">
      <div className="cp-entry-code">
        <label htmlFor="cp-code">
          <b>Your CrownPrint code</b>
          <span>It&rsquo;s at the top of your CrownPrint Intelligence Report — five axes, like <code>P2-D3-T3-S2-E2</code>.</span>
        </label>
        <input
          id="cp-code"
          name="cp"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="P2-D3-T3-S2-E2"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {unrecognized.length > 0 && (
          <p className="cp-entry-warn" role="status">
            We couldn&rsquo;t read {unrecognized.map((u) => `“${u}”`).join(", ")} — check it against your report, or set your axes below.
          </p>
        )}
        <button type="button" className="cp-entry-toggle" aria-expanded={manual} onClick={() => setManual((m) => !m)}>
          {manual ? "Hide the axis pickers" : "Don't have your code? Set your axes instead"}
        </button>
      </div>

      {/* CrownPrint Core — the stable five. Hidden until asked for, because a
          shopper holding their code should never have to answer these. */}
      <div className={`cp-axes${manual ? "" : " cp-axes-hidden"}`} aria-hidden={!manual}>
        <p className="eyebrow">CROWNPRINT CORE</p>
        {CORE_AXES.map((axis) => (
          <fieldset key={axis.id} className="cp-axis">
            <legend>{axis.letter} · {axis.label}</legend>
            <div>
              {axis.levels.map((lvl) => (
                <label key={lvl.value} className={picked[axis.id] === lvl.value ? "active" : ""}>
                  <input
                    type="radio"
                    name={axis.id}
                    value={lvl.value}
                    checked={picked[axis.id] === lvl.value}
                    onChange={() => setAxis(axis.id, lvl.value)}
                    disabled={!manual}
                  />
                  <span><b>{axis.letter}{lvl.level}</b> {lvl.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {builtCode && <p className="cp-entry-built">That makes your CrownPrint code <b>{builtCode}</b>.</p>}
      </div>

      {/* Current state — the minimum needed to shop safely, and no more. Anyone
          here has already answered a full CrownPrint assessment at the Hair
          Wellness Lab; a second questionnaire on the storefront would be both a
          worse experience and a competing source of truth. Three questions by
          default, the rest optional. */}
      <div className="cp-state">
        <p className="eyebrow">WHAT&rsquo;S TRUE RIGHT NOW</p>
        <p className="cp-state-lead">
          Three quick ones — this is the part your CrownPrint code doesn&rsquo;t carry, because it changes. We ask the
          minimum we need and nothing else; if you&rsquo;re connected to the Hair Wellness Lab we don&rsquo;t ask at all.
        </p>
        <div className="cp-state-grid">
          {STATE_FIELDS.filter((f) => f.essential).map((field) => (
            <label key={field.id} className="cp-state-field">
              <span>{field.label}</span>
              <select name={field.param} defaultValue={state[field.id] ?? ""}>
                <option value="">No answer</option>
                {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ))}
        </div>
        <details className="cp-state-more" open={STATE_FIELDS.some((f) => !f.essential && state[f.id])}>
          <summary>Add more detail (optional)</summary>
          <div className="cp-state-grid">
            {STATE_FIELDS.filter((f) => !f.essential).map((field) => (
              <label key={field.id} className="cp-state-field">
                <span>{field.label}</span>
                <select name={field.param} defaultValue={state[field.id] ?? ""}>
                  <option value="">No answer</option>
                  {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            ))}
          </div>
        </details>
      </div>

      <div className="actions">
        <button className="button" type="submit" onClick={() => trackCrownPrintEvent("crownprint_type_submitted")}>
          Show My Products
        </button>
        <Link className="outline-button" href="/shop-by-crownprint">Connect my Hair Wellness Lab account instead</Link>
      </div>
      <p className="cp-fine">
        Nothing you enter here leaves your browser except as the link to this page — we don&rsquo;t store your CrownPrint,
        and we never see your Hair Wellness Lab account.
      </p>
    </form>
  );
}

export default function CrownPrintFinder({
  mode,
  rawCode,
  code,
  core,
  state,
  recognized,
  unrecognized,
  priorityLabel,
  priorities,
  functions,
  gaps,
  notes,
  cards,
  noStrongMatch,
  noFit,
  whatToLookFor,
  shareQuery,
  source,
  sourceLabel,
  sourceDetail,
  confidence,
  missingAxes,
}: {
  mode: "intro" | "unreadable" | "results";
  rawCode: string;
  code: string;
  core: CrownPrintCore;
  state: CrownStateInput;
  recognized: RecognizedSignal[];
  unrecognized: string[];
  priorityLabel: string;
  priorities: LabelledPoint[];
  functions: LabelledPoint[];
  gaps: LabelledPoint[];
  notes: string[];
  cards: FitCard[];
  noStrongMatch: boolean;
  noFit: boolean;
  whatToLookFor: WhatToLookFor;
  shareQuery: string;
  /** Which authority produced this guidance — drives the legend's honesty note. */
  source: GuidanceSource;
  sourceLabel: string;
  sourceDetail: string;
  confidence: "full" | "reduced" | "limited";
  missingAxes: { letter: string; label: string }[];
}) {
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);

  const onAdd = (c: FitCard) => {
    addToBag(c.slug);
    trackCrownPrintEvent("crownprint_type_product_added_to_cart", { contentId: c.slug });
    trackAddToCart({ value: c.price ?? 0, currency: "USD", contentId: c.slug });
    setToast(`${c.name} added to your bag.`);
    window.setTimeout(() => setToast(""), 4000);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/crownprint?${shareQuery}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch { /* clipboard unavailable — the URL is already in the address bar */ }
  };

  return (
    <>
      <div className={`cp-toast${toast ? " show" : ""}`} role="status" aria-live="polite">{toast}</div>

      {mode === "unreadable" && (
        <section className="cp-panel cp-unreadable" aria-labelledby="cp-unreadable-heading">
          <p className="eyebrow">LET&rsquo;S TRY THAT AGAIN</p>
          <h2 id="cp-unreadable-heading">We couldn&rsquo;t read that as a CrownPrint code.</h2>
          <p>
            A CrownPrint code is five axes with a level each — porosity, density, strand thickness, scalp type, and
            elasticity — printed at the top of your CrownPrint Intelligence Report, like <b>P2-D3-T3-S2-E2</b>. Partial
            codes are fine: <b>P3-T1</b> is enough for us to start with.
          </p>
          <p>
            No report handy? Set your axes below and we&rsquo;ll match you from those instead — you&rsquo;ll never be sent
            away empty-handed.
          </p>
        </section>
      )}

      {/* 1 — YOUR CROWNPRINT */}
      <section className="cp-panel cp-finder" aria-labelledby="cp-finder-heading">
        <p className="eyebrow">{mode === "results" ? "YOUR CROWNPRINT" : "ENTER YOUR CROWNPRINT"}</p>
        <h2 id="cp-finder-heading">{mode === "results" ? code || "Your CrownPrint" : "Shop by your CrownPrint."}</h2>

        {mode === "results" && recognized.length > 0 && (
          <div className="cp-readout">
            {recognized.map((s) => (
              <div key={s.axis}>
                <b>{s.letter}{s.level} · {s.label}</b>
                <span>{s.blurb}</span>
              </div>
            ))}
          </div>
        )}

        <Entry rawCode={rawCode} core={core} state={state} open={mode !== "results"} unrecognized={unrecognized} />
      </section>

      {mode === "results" && (
        <>
          {/* Provenance. This page is the fallback, and says so — it is never
              presented as the CrownPrint 360 Product Blueprint. */}
          <aside className={`cp-provenance cp-provenance-${confidence}`} aria-label="About this guidance">
            <p className="cp-provenance-label">{sourceLabel}</p>
            <p>{sourceDetail}</p>
            {missingAxes.length > 0 && (
              <p className="cp-provenance-missing">
                <b>Not given:</b> {missingAxes.map((a) => `${a.label} (${a.letter})`).join(", ")}. We don&rsquo;t
                guess at missing axes — add them above and these matches sharpen.
              </p>
            )}
            <p className="cp-provenance-cta">
              For the full picture, <Link href="/shop-by-crownprint">connect your Hair Wellness Lab CrownPrint</Link>.
            </p>
          </aside>

          {/* 2 — CURRENT PRIORITIES */}
          <section className="cp-panel cp-priorities" aria-labelledby="cp-priorities-heading">
            <p className="eyebrow">YOUR CURRENT PRIORITIES</p>
            <h2 id="cp-priorities-heading">{priorityLabel}</h2>
            <PointList points={priorities} numbered />
            {notes.map((note) => <p key={note} className="cp-note">{note}</p>)}
          </section>

          {/* 3 — PRODUCT FUNCTIONS YOU NEED */}
          <section className="cp-panel cp-functions" aria-labelledby="cp-functions-heading">
            <p className="eyebrow">PRODUCT FUNCTIONS YOU NEED</p>
            <h2 id="cp-functions-heading">What your routine has to do</h2>
            <p>
              These are functions, not products. Any brand&rsquo;s label can be judged against them — including ours.
            </p>
            <PointList points={functions} />
          </section>

          {/* 4 — HOW YOUR CROWNPRINT MATCHES WORK. Before the results, always:
              a shopper should know what Strong, Good, and Conditional mean
              before they read a single card labelled with one. */}
          <MatchLegend source={source} />

          {/* 5 — BEST WYNN MATCHES */}
          <section className="cp-panel cp-results" aria-labelledby="cp-results-heading">
            <p className="eyebrow">BEST WYNN MATCHES</p>
            <h2 id="cp-results-heading">
              {noFit ? "No product match for this CrownPrint" : "What we’d put in your routine"}
            </h2>
            {!noFit && (
              <p>
                Grouped by how well each one fits your axes. We don&rsquo;t pad this list — if something isn&rsquo;t
                pointed at by your CrownPrint, it isn&rsquo;t here.
              </p>
            )}

            {noFit ? (
              <p className="cp-note">
                Nothing we currently sell is pointed at by this CrownPrint. The guidance below is what to do instead.
              </p>
            ) : (
              <>
                <MatchGroup cls="strong" cards={cards} onAdd={onAdd} />
                <MatchGroup cls="good" cards={cards} onAdd={onAdd} />
                <MatchGroup cls="conditional" cards={cards} onAdd={onAdd} />
              </>
            )}

            <div className="cp-utility">
              <button type="button" className="cp-linklike" onClick={copyLink}>
                {copied ? "Link copied" : "Copy a link to these results"}
              </button>
              <span aria-hidden="true">·</span>
              <Link href="/shop-by-crownprint">Connect your Hair Wellness Lab CrownPrint</Link>
              <span aria-hidden="true">·</span>
              <Link href="/#shop">Browse everything</Link>
            </div>
            <p className="cp-fine">
              CrownPrint explains fit — it doesn&rsquo;t change what a product does. This is product-fit guidance, not
              medical advice, clinical validation, or a diagnosis. Patch test, and read each product&rsquo;s full
              ingredient list on its product page.
            </p>
          </section>

          {/* 6 — WHAT WYNN DOES NOT CURRENTLY CARRY */}
          {gaps.length > 0 && (
            <section className="cp-panel cp-gaps" aria-labelledby="cp-gaps-heading">
              <p className="eyebrow">WHAT WYNN DOES NOT CURRENTLY CARRY</p>
              <h2 id="cp-gaps-heading">Gaps we won&rsquo;t pretend to fill</h2>
              <p>
                Your CrownPrint points at these, and we don&rsquo;t make them. Buy them elsewhere — we&rsquo;d rather you
                have the right routine than a complete receipt.
              </p>
              <PointList points={gaps} />
            </section>
          )}

          {/* 7 — WHAT TO LOOK FOR ELSEWHERE */}
          <HonestFit guidance={whatToLookFor} noFit={noFit} noStrongMatch={noStrongMatch} />
        </>
      )}
    </>
  );
}
