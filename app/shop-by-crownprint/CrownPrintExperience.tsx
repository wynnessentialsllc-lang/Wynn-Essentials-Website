"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { trackAddToCart, trackCrownPrintEvent } from "../analytics";
import type { MatchClass, NoMatchGuidance } from "../../lib/crownprint";

export type CardProduct = {
  slug: string;
  name: string;
  subtitle: string;
  price: number | null;
  image: { src: string; alt: string } | null;
  url: string;
  // No color/variant options → safe to add straight to the bag from a card.
  simple: boolean;
  matchClass: MatchClass;
  explanation: string;
  usage?: string;
};

type Urls = { create: string; update: string; disconnect: string; productHub: string | null };

const money = (v: number | null) =>
  v == null ? "Price to be confirmed" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

const CLASS_LABEL: Record<MatchClass, string> = {
  strong: "Strong Wynn Essentials Match",
  good: "Good Wynn Essentials Match",
  conditional: "Conditional Wynn Essentials Match",
};

// Cart item shape and storage key must match the storefront (app/WynnShop.tsx),
// so items added here appear in the same bag and check out through the same path.
type CartItem = { slug: string; quantity: number; color?: string; variantId?: string };

function addToBag(slug: string) {
  try {
    const cart: CartItem[] = JSON.parse(localStorage.getItem("wynnCart") || "[]");
    const existing = cart.find((i) => i.slug === slug && !i.color && !i.variantId);
    const next = existing
      ? cart.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i))
      : [...cart, { slug, quantity: 1 }];
    localStorage.setItem("wynnCart", JSON.stringify(next));
    // Remember which products came from a CrownPrint match, so the order-success
    // page can attribute the purchase (matched_product_purchased). No PII.
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
        <p className="cp-card-why"><b>Why it may fit:</b> {product.explanation}</p>
        {product.usage && <p className="cp-card-usage"><b>How to use:</b> {product.usage}</p>}
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

function NoStrongMatch({ guidance, productHub }: { guidance?: NoMatchGuidance; productHub: string | null }) {
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
          {guidance.hairNeed && (
            <div><h4>What your hair needs right now</h4><p>{guidance.hairNeed}</p></div>
          )}
          {guidance.productType && (
            <div><h4>Product type to look for</h4><p>{guidance.productType}</p></div>
          )}
          {guidance.formulationCharacteristics.length > 0 && (
            <div><h4>Formulation characteristics to look for</h4><ul>{guidance.formulationCharacteristics.map((x) => <li key={x}>{x}</li>)}</ul></div>
          )}
          {guidance.ingredientFunctions.length > 0 && (
            <div><h4>Ingredient functions to consider</h4><ul>{guidance.ingredientFunctions.map((x) => <li key={x}>{x}</li>)}</ul></div>
          )}
          {guidance.whatMayNotFit.length > 0 && (
            <div><h4>What may not fit your current need</h4><ul>{guidance.whatMayNotFit.map((x) => <li key={x}>{x}</li>)}</ul></div>
          )}
          {guidance.whyThisMatters && (
            <div><h4>Why this matters for your current CrownPrint</h4><p>{guidance.whyThisMatters}</p></div>
          )}
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

export default function CrownPrintExperience({
  integrationReady,
  available,
  fresh,
  refreshRequired,
  currentPriority,
  noStrongMatch,
  hasStrong,
  connected,
  products,
  urls,
}: {
  integrationReady: boolean;
  available: boolean;
  fresh: boolean;
  refreshRequired: boolean;
  currentPriority?: string;
  noStrongMatch?: NoMatchGuidance;
  hasStrong: boolean;
  connected: boolean;
  products: CardProduct[];
  urls: Urls;
}) {
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);
  const showResults = connected && available;

  // View + connection analytics, fired once on mount. No CrownPrint answers are
  // ever available on the client, so nothing sensitive can be sent.
  useEffect(() => {
    trackCrownPrintEvent("shop_by_crownprint_viewed");

    let status: string | null = null;
    try {
      const p = new URLSearchParams(window.location.search);
      status = p.get("status");
    } catch { /* ignore */ }

    if (status === "connected") trackCrownPrintEvent("crownprint_connected");
    if (status) {
      setToast(
        status === "connected" ? "Your CrownPrint is connected — here are your matches."
        : status === "disconnected" ? "Your CrownPrint has been disconnected from this device."
        : status === "cancelled" ? "No changes were made."
        : status === "unavailable" ? "CrownPrint isn't available just yet. Please try again soon."
        : status === "error" ? "We couldn't verify that securely. Please try connecting again."
        : "",
      );
      // Clean the status out of the URL so a refresh doesn't re-fire or re-toast.
      try { window.history.replaceState(null, "", window.location.pathname); } catch { /* ignore */ }
    }

    if (showResults) {
      if (products.some((p) => p.matchClass === "strong")) trackCrownPrintEvent("strong_match_viewed");
      if (products.some((p) => p.matchClass === "good")) trackCrownPrintEvent("good_match_viewed");
      if (products.some((p) => p.matchClass === "conditional")) trackCrownPrintEvent("conditional_match_viewed");
      if (!hasStrong || noStrongMatch) trackCrownPrintEvent("no_strong_match_viewed");
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

  return (
    <>
      <div className={`cp-toast${toast ? " show" : ""}`} role="status" aria-live="polite">{toast}</div>

      {!showResults && !integrationReady ? (
        // INTEGRATION UNAVAILABLE — HWL isn't configured yet. We show this
        // explicitly instead of inventing matches or offering a create button
        // that can't complete the round-trip.
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
          <p className="cp-fine">No fake results, ever. Your CrownPrint stays at the Hair Wellness Lab.</p>
        </section>
      ) : !showResults ? (
        // USER STATE 1 — integration is live, but this device has no CrownPrint yet.
        <section className="cp-panel cp-create" aria-labelledby="cp-create-heading">
          <p className="eyebrow">GET STARTED</p>
          <h2 id="cp-create-heading">Create your CrownPrint™</h2>
          <p>
            CrownPrint looks at more than one trait. In a few minutes at the Hair Wellness Lab, you&rsquo;ll
            create a CrownPrint that reflects your hair&rsquo;s characteristics and current state — then come
            back here to see which Wynn Essentials products may fit what your hair needs right now.
          </p>
          <div className="cp-create-steps">
            <div><span>01</span><p>Create your CrownPrint at the Hair Wellness Lab.</p></div>
            <div><span>02</span><p>We securely bring back a safe match — never your answers.</p></div>
            <div><span>03</span><p>Shop Wynn Essentials products matched to your current need.</p></div>
          </div>
          <a
            className="button"
            href={urls.create}
            onClick={() => trackCrownPrintEvent("create_crownprint_clicked")}
          >
            Create My CrownPrint™
          </a>
          <p className="cp-fine">Your CrownPrint answers stay at the Hair Wellness Lab. We never place them in the address bar.</p>
        </section>
      ) : (
        // USER STATE 2 — has CrownPrint.
        <section className="cp-panel cp-results" aria-labelledby="cp-results-heading">
          {currentPriority && (
            <div className="cp-priority">
              <p className="eyebrow">CURRENT HAIR PRIORITY</p>
              <h2 id="cp-results-heading">{currentPriority}</h2>
            </div>
          )}

          {(!fresh || refreshRequired) && (
            <div className="cp-stale" role="note">
              <p className="eyebrow">A QUICK CHECK-IN</p>
              <p>
                Your CrownPrint foundation may stay relatively consistent, but what your hair needs right
                now can change — after protective styles, takedowns, heat, chemical services, buildup,
                dryness, scalp changes, or a recent treatment.
              </p>
              <a
                className="button"
                href={urls.update}
                onClick={() => trackCrownPrintEvent("crownstate_update_clicked")}
              >
                Update My Hair Needs
              </a>
            </div>
          )}

          <MatchGroup cls="strong" cards={products} onAdd={onAdd} />
          <MatchGroup cls="good" cards={products} onAdd={onAdd} />
          <MatchGroup cls="conditional" cards={products} onAdd={onAdd} />

          {(!hasStrong || noStrongMatch) && (
            <NoStrongMatch guidance={noStrongMatch} productHub={urls.productHub} />
          )}

          <div className="cp-utility">
            <a href={urls.update} onClick={() => trackCrownPrintEvent("crownstate_update_clicked")}>Update my hair needs</a>
            <span aria-hidden="true">·</span>
            <a href={urls.disconnect}>Disconnect CrownPrint from this device</a>
          </div>
          <p className="cp-fine">
            CrownPrint explains fit — it doesn&rsquo;t change what a product does. This is product-fit
            guidance, not medical advice or a diagnosis.
          </p>
        </section>
      )}
    </>
  );
}
