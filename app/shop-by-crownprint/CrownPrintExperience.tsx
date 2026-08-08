"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { trackAddToCart, trackCrownPrintEvent } from "../analytics";
import type { ExperienceState, MatchClass, WhatToLookFor } from "../../lib/crownprint";
import type { LabelledPoint } from "../../lib/crownprint-fit";
import type { GuidanceSource, MatchRationale } from "../../lib/crownprint-match-intelligence";
import { MatchLegend, MatchReasoning } from "../MatchIntelligence";

export type CardProduct = {
  slug: string;
  name: string;
  subtitle: string;
  price: number | null;
  image: { src: string; alt: string } | null;
  url: string;
  simple: boolean; // no color/variant options → safe to add straight to the bag
  matchClass: MatchClass;
  why: string;
  // Wynn's own catalog knowledge, added server-side. HWL sends neither, and the
  // shopper needs both to act on a match: which need it serves, and when to use it.
  need?: string;
  whenToUse?: string;
  /**
   * Why THIS product is in THIS class for THIS shopper, built server-side from
   * the signals the Hair Wellness Lab resolved. Never optional: a classification
   * without its reasoning is the thing this replaced.
   */
  rationale: MatchRationale;
};

type Urls = { connect: string; create: string; refresh: string; disconnect: string; productHub: string | null };

const money = (v: number | null) =>
  v == null ? "Price to be confirmed" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

const CLASS_LABEL: Record<MatchClass, string> = {
  strong: "Strong Wynn Essentials Match",
  good: "Good Wynn Essentials Match",
  conditional: "Conditional Wynn Essentials Match",
};

// One sentence, used everywhere CrownPrint is offered, so the paid Premium
// assessment is described identically in every state. Pricing is Hair Wellness
// Lab's and is not set here.
const CROWNPRINT_EXPLAINER =
  "CrownPrint™ is a Premium, science-informed hair intelligence assessment that helps identify how your hair behaves and what it may need right now.";

const STALE_HEADLINE = "Your CrownPrint is connected, but your current hair needs may have changed.";

// One funnel event per resolved state, so we can see WHY a shopper didn't reach
// matches. The event name is the only payload — no CrownPrint data, ever.
const STATE_EVENT: Record<ExperienceState, string> = {
  MATCH_READY: "crownprint_state_match_ready_viewed",
  CROWNSTATE_STALE: "crownprint_state_crownstate_stale_viewed",
  NO_CROWNPRINT: "crownprint_state_no_crownprint_viewed",
  AUTH_REQUIRED: "crownprint_state_auth_required_viewed",
  TEMPORARILY_UNAVAILABLE: "crownprint_state_temporarily_unavailable_viewed",
  INTEGRATION_UNAVAILABLE: "crownprint_state_integration_unavailable_viewed",
  CONNECT: "crownprint_state_connect_viewed",
};

// Cart shape and key must match the storefront (app/WynnShop.tsx) so items added
// here land in the same bag and check out through the same native Stripe path.
type CartItem = { slug: string; quantity: number; color?: string; variantId?: string };

function addToBag(slug: string) {
  try {
    const cart: CartItem[] = JSON.parse(localStorage.getItem("wynnCart") || "[]");
    const existing = cart.find((i) => i.slug === slug && !i.color && !i.variantId);
    const next = existing
      ? cart.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i))
      : [...cart, { slug, quantity: 1 }];
    localStorage.setItem("wynnCart", JSON.stringify(next));
    const matched: string[] = JSON.parse(localStorage.getItem("wynnCrownMatched") || "[]");
    if (!matched.includes(slug)) localStorage.setItem("wynnCrownMatched", JSON.stringify([...matched, slug]));
  } catch { /* storage unavailable — silently skip */ }
}

function MatchCard({ product, onAdd }: { product: CardProduct; onAdd: (p: CardProduct) => void }) {
  return (
    <article className="cp-card">
      <Link
        href={`/#product-${product.slug}`}
        className="cp-card-art"
        aria-label={`Shop ${product.name}`}
        onClick={() => trackCrownPrintEvent("matched_product_clicked", { contentId: product.slug })}
      >
        {product.image ? (
          <img src={product.image.src} alt={product.image.alt} width={800} height={800} loading="lazy" />
        ) : (
          <span className="cp-card-art-fallback" aria-hidden="true">{product.name}</span>
        )}
        <span className={`cp-badge cp-badge-${product.matchClass}`}>{CLASS_LABEL[product.matchClass]}</span>
      </Link>
      <div className="cp-card-body">
        <p className="eyebrow">{product.subtitle}</p>
        <h4>{product.name}</h4>
        <strong className="cp-card-price">{money(product.price)}</strong>
        {product.need && <p className="cp-card-need"><b>Need it serves:</b> {product.need}</p>}
        <MatchReasoning rationale={product.rationale} />
        {product.whenToUse && <p className="cp-card-usage"><b>When to use it:</b> {product.whenToUse}</p>}
        <div className="cp-card-actions">
          {product.simple && product.price != null ? (
            <button className="button full" onClick={() => onAdd(product)}>Add to Cart</button>
          ) : null}
          <Link
            href={`/products/${product.slug}`}
            className="outline-button full"
            onClick={() => trackCrownPrintEvent("matched_product_clicked", { contentId: product.slug })}
          >
            Shop Product
          </Link>
        </div>
      </div>
    </article>
  );
}

function MatchGroup({ cls, cards, onAdd }: { cls: MatchClass; cards: CardProduct[]; onAdd: (p: CardProduct) => void }) {
  const group = cards.filter((c) => c.matchClass === cls);
  if (!group.length) return null;
  return (
    <div className="cp-group">
      <h3 className={`cp-group-heading cp-group-${cls}`}>{CLASS_LABEL[cls].toUpperCase()}</h3>
      <div className="cp-grid">{group.map((c) => <MatchCard key={c.slug} product={c} onAdd={onAdd} />)}</div>
    </div>
  );
}

function NoStrongMatch({ guidance, productHub }: { guidance?: WhatToLookFor; productHub: string | null }) {
  return (
    <section className="cp-nomatch" aria-labelledby="cp-nomatch-heading">
      <p className="eyebrow">HONEST FIT</p>
      <h3 id="cp-nomatch-heading">
        We don&rsquo;t currently have a Wynn Essentials product that strongly matches this particular need.
      </h3>
      <p className="cp-nomatch-lead">
        That&rsquo;s okay — and worth knowing. Here&rsquo;s what to look for so you can care for your hair well right now.
      </p>
      {guidance && (
        <div className="cp-nomatch-grid">
          {guidance.hairNeed && <div><h4>What your hair needs right now</h4><p>{guidance.hairNeed}</p></div>}
          {guidance.productType && <div><h4>Product type to look for</h4><p>{guidance.productType}</p></div>}
          {guidance.formulationCharacteristics.length > 0 && <div><h4>Formulation characteristics to look for</h4><ul>{guidance.formulationCharacteristics.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {guidance.ingredientFunctions.length > 0 && <div><h4>Ingredient functions to consider</h4><ul>{guidance.ingredientFunctions.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {guidance.whatMayNotFit.length > 0 && <div><h4>What may not fit your current need</h4><ul>{guidance.whatMayNotFit.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {guidance.whyThisMatters && <div><h4>Why this matters for your current CrownPrint</h4><p>{guidance.whyThisMatters}</p></div>}
        </div>
      )}
      {productHub && (
        <a className="button" href={productHub} target="_blank" rel="noopener noreferrer">
          Explore the Hair Wellness Lab Product Hub
        </a>
      )}
    </section>
  );
}

// Shared price block: CrownPrint is a one-time $9.99 Hair Wellness Lab purchase,
// never a subscription. Rendered wherever the create CTA appears.
function PremiumPrice() {
  return (
    <div className="cp-price">
      <strong>$9.99 one-time</strong>
      <span>No subscription</span>
    </div>
  );
}

function CreateCta({ href }: { href: string }) {
  return (
    <a className="button" href={href} onClick={() => trackCrownPrintEvent("create_crownprint_clicked")}>
      Create My CrownPrint&trade; — $9.99
    </a>
  );
}

// The escape hatch from every non-result state.
//
// Connecting depends on the whole Hair Wellness Lab round trip succeeding. When
// any part of it doesn't — not signed in, HWL erroring on the exchange, the
// integration not live on this deployment — a shopper who is holding their
// CrownPrint code has no reason to be stuck. /crownprint matches them from that
// code alone, so no state on this page is a dead end any more.
function CodeShortcut() {
  return (
    <p className="cp-shortcut">
      <b>Have your CrownPrint code?</b> It&rsquo;s the five axes at the top of your CrownPrint Intelligence Report, like{" "}
      <code>P2-D3-T3-S2-E2</code>. You can skip the sign-in entirely —{" "}
      <Link href="/crownprint" onClick={() => trackCrownPrintEvent("crownprint_code_shortcut_clicked")}>
        enter your code and shop it now
      </Link>
      .
    </p>
  );
}

// The "I already have my CrownPrint" CTA. It ALWAYS goes to our connect hop,
// which redirects to Hair Wellness Lab /crownprint/connect so HWL resolves the
// shopper's real state. It must never point back at /shop-by-crownprint.
function ConnectCta({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  return (
    <a
      className={primary ? "button" : "outline-button"}
      href={href}
      onClick={() => trackCrownPrintEvent("connect_crownprint_clicked")}
    >
      {label}
    </a>
  );
}

// ---------------------------------------------------------------------------
// One panel per resolved state. Every state says what happened and offers the
// action that actually moves the shopper forward.
// ---------------------------------------------------------------------------

// RECOVERY — the handoff itself broke (expired link, failed handshake, or a
// return hop that arrived without this browser's session). The shopper very
// likely OWNS a CrownPrint, so this must never be the create-and-pay intro: no
// price, no assessment, no Routine Builder. Just finish the connection.
function ReconnectPanel({ urls, note }: { urls: Urls; note?: string }) {
  return (
    <section className="cp-panel cp-reconnect" aria-labelledby="cp-reconnect-heading">
      <p className="eyebrow">ALMOST THERE</p>
      <h2 id="cp-reconnect-heading">Let&rsquo;s finish connecting your CrownPrint.</h2>
      {note && <p className="cp-note" role="status">{note}</p>}
      <p>
        The secure handoff didn&rsquo;t complete, so we stopped rather than show you anything we couldn&rsquo;t stand
        behind. This says nothing about your CrownPrint — it&rsquo;s still yours, still active, and still at the Hair
        Wellness Lab.
      </p>
      <p>
        <b>You will not be charged again, and you will not retake the assessment.</b> Connecting simply issues a fresh
        secure link.
      </p>
      <div className="actions">
        <ConnectCta href={urls.connect} label="Try Connecting Again" primary />
        <Link className="outline-button" href="/#shop">Keep Shopping</Link>
      </div>
      <CodeShortcut />
      <p className="cp-fine">
        If it keeps failing, finish the Hair Wellness Lab step in this same browser rather than switching devices
        mid-flow — that&rsquo;s the most common cause.
      </p>
    </section>
  );
}

// CONNECT — nothing connected on this device yet. Educational intro + both CTAs.
function ConnectPanel({ urls, note }: { urls: Urls; note?: string }) {
  return (
    <section className="cp-panel cp-create" aria-labelledby="cp-create-heading">
      <p className="eyebrow">GET STARTED</p>
      <h2 id="cp-create-heading">Create your CrownPrint&trade;</h2>
      {note && <p className="cp-note" role="status">{note}</p>}
      <p>
        CrownPrint looks at more than one trait. At the Hair Wellness Lab you&rsquo;ll create a CrownPrint
        that reflects your hair&rsquo;s characteristics and current state — then come back here to see which
        Wynn Essentials products may fit what your hair needs right now.
      </p>
      <PremiumPrice />
      <div className="cp-create-steps">
        <div><span>01</span><p>Create your CrownPrint at the Hair Wellness Lab.</p></div>
        <div><span>02</span><p>We securely bring back a safe match — never your answers.</p></div>
        <div><span>03</span><p>Shop Wynn Essentials products matched to your current need.</p></div>
      </div>
      {/* Two DISTINCT destinations: `create` starts the paid HWL CrownPrint
          flow; `connect` sends the shopper to HWL /crownprint/connect, which
          resolves whether they actually have one. They must never point at the
          same URL, and neither may point back at this page. */}
      <div className="actions">
        <CreateCta href={urls.create} />
        <ConnectCta href={urls.connect} label="I Already Have My CrownPrint&trade;" />
      </div>
      <CodeShortcut />
      <p className="cp-fine">Your CrownPrint answers stay at the Hair Wellness Lab. We never place them in the address bar.</p>
    </section>
  );
}

// NO_CROWNPRINT — HWL identified the shopper and confirmed they have no usable
// CrownPrint (never purchased/completed, or the entitlement was refunded or
// revoked). This is a verdict, so it is stated plainly and priced honestly.
function NoCrownPrintPanel({ urls }: { urls: Urls }) {
  return (
    <section className="cp-panel cp-nocrownprint" aria-labelledby="cp-nocp-heading">
      <p className="eyebrow">CROWNPRINT NOT FOUND</p>
      <h2 id="cp-nocp-heading">You don&rsquo;t have a CrownPrint yet.</h2>
      <p>{CROWNPRINT_EXPLAINER}</p>
      <p>
        Once it exists, we can bring back a safe match and show you which Wynn Essentials products may fit
        what your hair needs right now. Until then there&rsquo;s nothing for us to match against — so we
        won&rsquo;t guess.
      </p>
      <PremiumPrice />
      <div className="actions">
        <CreateCta href={urls.create} />
        <ConnectCta href={urls.connect} label="I Already Have My CrownPrint&trade;" />
      </div>
      <CodeShortcut />
      <p className="cp-fine">
        Created your CrownPrint under a different Hair Wellness Lab account? Use &ldquo;I already have my
        CrownPrint&rdquo; to connect that one.
      </p>
    </section>
  );
}

// AUTH_REQUIRED — HWL could not identify the user. Signing in is only step one:
// HWL re-checks entitlement afterwards, so this promises nothing about matches.
function AuthRequiredPanel({ urls }: { urls: Urls }) {
  return (
    <section className="cp-panel cp-auth" aria-labelledby="cp-auth-heading">
      <p className="eyebrow">ONE STEP FIRST</p>
      <h2 id="cp-auth-heading">Sign in to connect your CrownPrint.</h2>
      <p>
        Your CrownPrint lives in your Hair Wellness Lab account. Sign in there and we&rsquo;ll bring back a
        safe match — your answers never leave the Lab.
      </p>
      <p>
        If that account doesn&rsquo;t have a CrownPrint yet, you&rsquo;ll come back here with the option to
        create one.
      </p>
      <div className="actions">
        <ConnectCta href={urls.connect} label="Sign In to Connect My CrownPrint&trade;" primary />
        <Link className="outline-button" href="/#shop">Keep Shopping</Link>
      </div>
      <CodeShortcut />
      <p className="cp-fine">We never see your Hair Wellness Lab password, and we never receive your CrownPrint answers.</p>
    </section>
  );
}

// CROWNSTATE_STALE without a renderable session — the CrownPrint is real, so we
// never ask for payment again; we ask for a CrownState refresh.
function StalePanel({ urls, message }: { urls: Urls; message?: string }) {
  return (
    <section className="cp-panel cp-stale-panel" aria-labelledby="cp-stale-heading">
      <p className="eyebrow">A QUICK CHECK-IN</p>
      <h2 id="cp-stale-heading">{STALE_HEADLINE}</h2>
      <p>
        {message ||
          "Your CrownPrint foundation stays relatively consistent, but what your hair needs right now can change — after protective styles, takedowns, heat, chemical services, buildup, dryness, scalp changes, or a recent treatment."}
      </p>
      <div className="actions">
        <a className="button" href={urls.refresh} onClick={() => trackCrownPrintEvent("crownstate_update_clicked")}>
          Update My Hair Needs
        </a>
        <Link className="outline-button" href="/#shop">Keep Shopping</Link>
      </div>
      <CodeShortcut />
      <p className="cp-fine">This is a quick update to your current hair needs — no additional payment.</p>
    </section>
  );
}

// TEMPORARILY_UNAVAILABLE — configured, but HWL didn't answer. Explicitly NOT a
// statement about whether the shopper has a CrownPrint.
function TemporarilyUnavailablePanel({ urls }: { urls: Urls }) {
  return (
    <section className="cp-panel cp-temp" aria-labelledby="cp-temp-heading">
      <p className="eyebrow">PLEASE TRY AGAIN</p>
      <h2 id="cp-temp-heading">CrownPrint matching is temporarily unavailable.</h2>
      <p>
        We couldn&rsquo;t reach the Hair Wellness Lab just now, so we can&rsquo;t show your match yet.
        This is temporary and says nothing about your CrownPrint — please try again in a few minutes.
      </p>
      <div className="actions">
        <ConnectCta href={urls.connect} label="Try Again" primary />
        <Link className="outline-button" href="/#shop">Shop the Essentials</Link>
      </div>
      <CodeShortcut />
      <p className="cp-fine">No fake results, ever.</p>
    </section>
  );
}

// INTEGRATION_UNAVAILABLE — the Wynn↔HWL connection isn't live on this
// deployment. Also distinct from "you don't have a CrownPrint".
function IntegrationUnavailablePanel() {
  return (
    <section className="cp-panel cp-unavailable" aria-labelledby="cp-unavailable-heading">
      <p className="eyebrow">CONNECTING SOON</p>
      <h2 id="cp-unavailable-heading">CrownPrint matching isn&rsquo;t available just yet.</h2>
      <p>
        Shop by CrownPrint pairs your Hair Wellness Lab CrownPrint with Wynn Essentials products.
        The secure connection to the Hair Wellness Lab isn&rsquo;t live on this site yet — so rather
        than show you guesses, we&rsquo;ll wait until it can give you a real, personalized match.
      </p>
      <p>In the meantime, you can still shop the full collection and build a routine.</p>
      <div className="actions">
        <Link className="button" href="/#shop">Shop the Essentials</Link>
        <Link className="outline-button" href="/#routine-finder">Try the Routine Finder</Link>
      </div>
      <CodeShortcut />
      <p className="cp-fine">No fake results, ever. Your CrownPrint stays at the Hair Wellness Lab.</p>
    </section>
  );
}

export default function CrownPrintExperience({
  state,
  showResults,
  note,
  recovery,
  source,
  sourceLabel,
  crownPrintCode,
  priorities,
  functions,
  gaps,
  contextNotes,
  crownStateMessage,
  currentPriorityLabel,
  noStrongMatch,
  whatToLookFor,
  hasStrong,
  products,
  urls,
}: {
  state: ExperienceState;
  showResults: boolean;
  note?: string;
  /** The marker on the URL means the handoff broke, not that they lack a CrownPrint. */
  recovery: boolean;
  /** Which authority produced this guidance — drives the legend's honesty note. */
  source: GuidanceSource;
  /** How this guidance was produced — "CrownPrint 360, resolved by the Lab". */
  sourceLabel: string;
  /** The shopper's own code, when HWL sent it. */
  crownPrintCode: string;
  /** HWL's ranked priorities. Wynn renders them; it does not compute them. */
  priorities: LabelledPoint[];
  /** The product functions HWL resolved this routine has to perform. */
  functions: LabelledPoint[];
  /** Resolved needs Wynn's catalog cannot serve. */
  gaps: LabelledPoint[];
  /** CrownState summary / staleness notes carried by the resolved context. */
  contextNotes: string[];
  crownStateMessage?: string;
  currentPriorityLabel?: string;
  noStrongMatch: boolean;
  whatToLookFor?: WhatToLookFor;
  hasStrong: boolean;
  products: CardProduct[];
  urls: Urls;
}) {
  // The opening toast is derived from the server-resolved state, so it is the
  // initial value rather than an effect that re-renders.
  const [toast, setToast] = useState(
    () => note || (showResults ? "Your CrownPrint is connected — here are your matches." : ""),
  );
  const toastTimer = useRef<number | undefined>(undefined);
  const stale = state === "CROWNSTATE_STALE";

  useEffect(() => {
    trackCrownPrintEvent("shop_by_crownprint_viewed");
    trackCrownPrintEvent(STATE_EVENT[state]);

    if (showResults) {
      trackCrownPrintEvent("crownprint_connected");
      if (products.some((p) => p.matchClass === "strong")) trackCrownPrintEvent("strong_match_viewed");
      if (products.some((p) => p.matchClass === "good")) trackCrownPrintEvent("good_match_viewed");
      if (products.some((p) => p.matchClass === "conditional")) trackCrownPrintEvent("conditional_match_viewed");
      if (noStrongMatch || !hasStrong) trackCrownPrintEvent("no_strong_match_viewed");
    }

    // Drop the marker from the URL only when the render no longer depends on it:
    // a session-backed result (or a plain acknowledgement) survives a refresh,
    // while an HWL verdict like NO_CROWNPRINT must stay addressable so reloading
    // doesn't silently downgrade the shopper back to the generic intro.
    if (showResults || state === "CONNECT") {
      try { window.history.replaceState(null, "", window.location.pathname); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    toastTimer.current = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(toastTimer.current);
  }, [toast]);

  const onAdd = (p: CardProduct) => {
    addToBag(p.slug);
    trackCrownPrintEvent("matched_product_added_to_cart", { contentId: p.slug });
    trackAddToCart({ value: p.price ?? 0, currency: "USD", contentId: p.slug });
    setToast(`${p.name} added to your bag.`);
  };

  // ----- One body per resolved state (never fabricated matches) -----
  let body: React.ReactNode;

  if (showResults) {
    // MATCH_READY, or CROWNSTATE_STALE with matches we can still show.
    body = (
      <section className="cp-panel cp-results" aria-labelledby="cp-results-heading">
        <div className="cp-provenance cp-provenance-full">
          <p className="cp-provenance-label">{sourceLabel}</p>
          <p>
            Your CrownPrint was resolved by the Hair Wellness Lab from your assessment, CrownState, and CrownHistory.
            Wynn Essentials matched its catalog to what the Lab resolved — it doesn&rsquo;t recalculate your CrownPrint.
          </p>
        </div>

        {crownPrintCode && (
          <div className="cp-priority">
            <p className="eyebrow">YOUR CROWNPRINT</p>
            <h2 className="cp-code-display">{crownPrintCode}</h2>
          </div>
        )}

        {contextNotes.map((n) => <p key={n} className="cp-note">{n}</p>)}

        {(priorities.length > 0 || currentPriorityLabel) && (
          <div className="cp-priority">
            <p className="eyebrow">YOUR CURRENT PRIORITIES</p>
            {priorities.length > 0 ? (
              <>
                <h2 id="cp-results-heading">{priorities[0].label}</h2>
                <ol className="cp-points cp-points-numbered">
                  {priorities.map((p, i) => (
                    <li key={p.label}>
                      <span className="cp-points-index" aria-hidden="true">#{i + 1}</span>
                      <b>{p.label}</b>
                      {p.detail && <span>{p.detail}</span>}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <h2 id="cp-results-heading">{currentPriorityLabel}</h2>
            )}
          </div>
        )}

        {stale && (
          <div className="cp-stale" role="note">
            <p className="eyebrow">A QUICK CHECK-IN</p>
            <p><b>{STALE_HEADLINE}</b></p>
            <p>
              {crownStateMessage ||
                "Your CrownPrint foundation may stay relatively consistent, but what your hair needs right now can change — after protective styles, takedowns, heat, chemical services, buildup, dryness, scalp changes, or a recent treatment."}
            </p>
            <a className="button" href={urls.refresh} onClick={() => trackCrownPrintEvent("crownstate_update_clicked")}>
              Update My Hair Needs
            </a>
            <p className="cp-fine">No additional payment — your CrownPrint stays yours.</p>
          </div>
        )}

        {functions.length > 0 && (
          <div className="cp-functions-inline">
            <p className="eyebrow">PRODUCT FUNCTIONS YOU NEED</p>
            <p className="cp-fine">Resolved by the Hair Wellness Lab. Everything below is Wynn matching its catalog to these.</p>
            <ul>{functions.map((f) => <li key={f.label}><b>{f.label}</b>{f.detail ? ` — ${f.detail}` : ""}</li>)}</ul>
          </div>
        )}

        {/* Before a single card labelled "Strong" or "Conditional" is read, the
            shopper is told what those words mean — and what they don't. */}
        <MatchLegend source={source} />

        <h3 className="cp-section-heading">Best Wynn matches</h3>
        <MatchGroup cls="strong" cards={products} onAdd={onAdd} />
        <MatchGroup cls="good" cards={products} onAdd={onAdd} />
        <MatchGroup cls="conditional" cards={products} onAdd={onAdd} />

        {gaps.length > 0 && (
          <div className="cp-functions-inline cp-gaps-inline">
            <p className="eyebrow">WHAT WYNN DOES NOT CURRENTLY CARRY</p>
            <p className="cp-fine">
              Your resolved CrownPrint calls for these and we don&rsquo;t make them. Buy them elsewhere — we&rsquo;d
              rather you have the right routine than a complete receipt.
            </p>
            <ul>{gaps.map((g) => <li key={g.label}><b>{g.label}</b>{g.detail ? ` — ${g.detail}` : ""}</li>)}</ul>
          </div>
        )}

        {(noStrongMatch || !hasStrong) && <NoStrongMatch guidance={whatToLookFor} productHub={urls.productHub} />}

        <div className="cp-utility">
          <a href={urls.refresh} onClick={() => trackCrownPrintEvent("crownstate_update_clicked")}>Update my hair needs</a>
          <span aria-hidden="true">·</span>
          <a href={urls.disconnect}>Disconnect CrownPrint from this device</a>
        </div>
        <p className="cp-fine">
          CrownPrint explains fit — it doesn&rsquo;t change what a product does. This is product-fit
          guidance, not medical advice or a diagnosis.
        </p>
      </section>
    );
  } else if (state === "NO_CROWNPRINT") {
    body = <NoCrownPrintPanel urls={urls} />;
  } else if (state === "AUTH_REQUIRED") {
    body = <AuthRequiredPanel urls={urls} />;
  } else if (state === "CROWNSTATE_STALE") {
    body = <StalePanel urls={urls} message={crownStateMessage} />;
  } else if (state === "TEMPORARILY_UNAVAILABLE") {
    body = <TemporarilyUnavailablePanel urls={urls} />;
  } else if (state === "INTEGRATION_UNAVAILABLE") {
    body = <IntegrationUnavailablePanel />;
  } else {
    // A broken handoff gets the reconnect panel; only a genuinely fresh visit
    // gets the create-and-pay intro.
    body = recovery ? <ReconnectPanel urls={urls} note={note} /> : <ConnectPanel urls={urls} note={note} />;
  }

  return (
    <>
      <div className={`cp-toast${toast ? " show" : ""}`} role="status" aria-live="polite">{toast}</div>
      {body}
    </>
  );
}
