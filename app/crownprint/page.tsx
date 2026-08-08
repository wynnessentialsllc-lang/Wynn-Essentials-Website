import type { Metadata } from "next";
import Link from "next/link";
import { products } from "../data";
import { SITE_URL, ldJson } from "../seo";
import {
  CORE_AXES,
  STATE_FIELDS,
  describeCore,
  labelForState,
  normalizeCore,
  normalizeCrownState,
  parseCrownPrintCode,
  profileToQuery,
  type CrownPrintProfile,
} from "../../lib/crownprint-code";
import { crownStateAction, crownprintIntegrationReady, readMatchSession } from "../../lib/crownprint";
import { hasTrusted360, selectGuidance } from "../../lib/crownprint-guidance";
import CrownPrintFinder, { type FitCard } from "./CrownPrintFinder";

// Reads the (httpOnly) Wynn session cookie to detect a connected CrownPrint, so
// this renders per-request.
export const dynamic = "force-dynamic";

// Shop by CrownPrint™ code — the Wynn-side entry point.
//
// WHY THIS PAGE EXISTS
// /shop-by-crownprint can only show matches once the Hair Wellness Lab round
// trip completes: HWL has to resolve the shopper, mint a one-time code, and
// answer the signed exchange. Any break in that chain — not signed in, the
// integration not configured on this deployment, HWL erroring on the exchange —
// leaves a shopper who genuinely HAS a CrownPrint standing on a page with no
// products on it. That is the exact dead end this page removes.
//
// A CrownPrint code is printed on the shopper's own CrownPrint Intelligence
// Report (e.g. "P2-D3-T3-S2-E2"). They already have it. So they type it in, tell
// us their CrownState — which is never in the code, because it changes — and we
// match the Wynn catalog against it right here, with no round trip and nothing
// to verify. The HWL connect flow stays available and stays the richer path.
//
// Everything renders on the SERVER from the URL, so results are shareable,
// bookmarkable, crawlable in their empty state, and work with JS switched off.

const CANONICAL = "/crownprint";

type SearchParams = Record<string, string | string[] | undefined>;

const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Personalized results are not indexable: `?cp=` produces an effectively
 * unbounded URL space, and one shopper's CrownPrint is not a landing page. The
 * bare page is the indexable, educational version — which is what a crawler
 * (carrying no query string) always sees.
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const sp = await searchParams;
  const personalized = Object.keys(sp).length > 0;
  const title = "Shop by Your CrownPrint™ Code | Wynn Essentials";
  const description =
    "Have your CrownPrint code from the Hair Wellness Lab? Enter it — P2-D3-T3-S2-E2 — tell us what your hair is doing right now, and see which Wynn Essentials products fit your CrownPrint Core and current CrownState.";
  return {
    title,
    description,
    alternates: { canonical: CANONICAL },
    ...(personalized ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title, description, url: CANONICAL, siteName: "Wynn Essentials", type: "website",
      images: [{ url: "/og-basket-espresso.jpg", width: 1200, height: 630, alt: "Wynn Essentials" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og-basket-espresso.jpg"] },
  };
}

function pageSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Shop by Your CrownPrint™ Code | Wynn Essentials",
    url: `${SITE_URL}${CANONICAL}`,
    description:
      "Enter your CrownPrint code and current CrownState to see which Wynn Essentials products fit your hair right now.",
    isPartOf: { "@type": "WebSite", name: "Wynn Essentials", url: SITE_URL },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Shop by CrownPrint", item: `${SITE_URL}/shop-by-crownprint` },
        { "@type": "ListItem", position: 3, name: "Your CrownPrint code", item: `${SITE_URL}${CANONICAL}` },
      ],
    },
  };
}

export default async function CrownPrintCodePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;

  // Two ways into the same Core: the code the shopper was given, and the axis
  // pickers for anyone who doesn't have it in front of them. Explicit axis
  // params win, so correcting one axis never means retyping the whole code.
  const rawCode = firstValue(sp.cp || sp.code);
  const parsed = parseCrownPrintCode(rawCode);
  const core = { ...parsed.core, ...normalizeCore(sp) };
  const state = normalizeCrownState(sp);

  const hasCore = Object.keys(core).length > 0;
  const hasState = Object.keys(state).length > 0;
  // A code that parsed to nothing gets an explanation, never a silent empty page.
  const mode: "intro" | "unreadable" | "results" = hasCore || hasState ? "results" : rawCode.trim() ? "unreadable" : "intro";

  const profile: CrownPrintProfile = { core, state };

  // ARCHITECTURE. Hair Wellness Lab is the CrownPrint intelligence authority; if
  // this shopper has completed the secure connect flow, their resolved
  // CrownPrint 360 is the answer and this page's Core-based reconstruction must
  // not compete with it — not even when they have also typed their code in
  // below. So a live trusted context sends them to the Blueprint instead, and
  // suppresses every CrownState question here: they already answered a full
  // assessment, and asking again would be a second source of truth.
  const trusted = crownprintIntegrationReady() ? await readMatchSession() : null;
  const connected = hasTrusted360(trusted);
  const stateAction = crownStateAction(trusted);

  const guidance = selectGuidance({ profile, catalog: products });
  const fit = guidance;

  // Join the fit result with the real catalog so every card carries actual Wynn
  // Essentials data — image, name, price, product URL. CrownPrint explains fit;
  // it never changes what a product is or what its own copy claims.
  const cards: FitCard[] = fit.matches
    .map((m): FitCard | null => {
      const p = products.find((x) => x.slug === m.productKey);
      if (!p) return null;
      const simple = !(p.colors?.length) && !((p.variants?.length ?? 0) > 1);
      return {
        slug: p.slug,
        name: p.name,
        subtitle: p.subtitle,
        price: p.price,
        image: p.images?.[0] ? { src: p.images[0].src, alt: p.images[0].alt } : null,
        simple,
        matchClass: m.matchClass,
        why: m.why,
        need: m.need,
        whenToUse: m.whenToUse,
        ...(m.caution ? { caution: m.caution } : {}),
        ...(m.limitedBy ? { limitedBy: m.limitedBy } : {}),
        keyIngredients: m.keyIngredients,
      };
    })
    .filter((c): c is FitCard => c !== null);

  const recognized = describeCore(core);
  const stateSummary = STATE_FIELDS
    .map((f) => ({ label: f.label, value: labelForState(f.id, state[f.id]) }))
    .filter((x): x is { label: string; value: string } => Boolean(x.value));

  return (
    <div className="legal-page cp-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(pageSchema()) }} />

      <header className="pdp-bar">
        <Link className="pdp-logo" href="/">WYNN ESSENTIALS<span>Healthy Hair Is a Practice</span></Link>
        <Link className="pdp-bar-shop" href="/#shop">Shop all products</Link>
      </header>
      <nav className="pdp-crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link> <span aria-hidden="true">/</span>{" "}
        <Link href="/shop-by-crownprint">Shop by CrownPrint™</Link> <span aria-hidden="true">/</span>{" "}
        <span aria-current="page">Your CrownPrint code</span>
      </nav>

      <main className="cp-main">
        <section className="cp-hero">
          <p className="eyebrow">SHOP BY YOUR CROWNPRINT™ CODE</p>
          <h1>You already know your CrownPrint. Let&rsquo;s shop it.</h1>
          <p className="cp-lead">
            Your CrownPrint Intelligence Report™ opens with a code — five Core axes, like <b>P2-D3-T3-S2-E2</b>.
            Enter it, tell us what your hair is doing this week, and we&rsquo;ll show you which Wynn Essentials products
            fit — and which don&rsquo;t.
          </p>
          <p className="cp-disclaimer">
            No account, no sign-in, and nothing to verify. This is product-fit guidance, not medical advice,
            clinical validation, or a diagnosis.
          </p>
        </section>

        {mode === "results" && stateSummary.length > 0 && (
          <p className="cp-statesummary">
            {stateSummary.map((s) => <span key={s.label}><b>{s.label}:</b> {s.value}</span>)}
          </p>
        )}

        {connected ? (
          <section className="cp-panel cp-connected" aria-labelledby="cp-connected-heading">
            <p className="eyebrow">YOU&rsquo;RE ALREADY CONNECTED</p>
            <h2 id="cp-connected-heading">Your full CrownPrint 360 Blueprint is ready.</h2>
            <p>
              This page is the manual fallback — it reasons from your CrownPrint Core and a few questions. You
              don&rsquo;t need it: the Hair Wellness Lab has already resolved your complete CrownPrint, including
              your CrownState and CrownHistory, and Wynn Essentials has matched the catalog to it.
            </p>
            {stateAction === "refresh" ? (
              <>
                <p>
                  One thing first — the Lab flagged your CrownState as out of date. Updating it there is free, takes a
                  moment, and your matches follow it. <b>We won&rsquo;t ask you those questions here.</b>
                </p>
                <div className="actions">
                  <a className="button" href="/shop-by-crownprint/connect?start=refresh">Update My Hair Needs</a>
                  <Link className="outline-button" href="/shop-by-crownprint">See My CrownPrint 360 Matches</Link>
                </div>
              </>
            ) : (
              <div className="actions">
                <Link className="button" href="/shop-by-crownprint">See My CrownPrint 360 Matches</Link>
                <Link className="outline-button" href="/#shop">Keep Shopping</Link>
              </div>
            )}
            <p className="cp-fine">
              Your CrownState is current and held at the Hair Wellness Lab, so nothing on this page will ask you to
              answer it again.
            </p>
          </section>
        ) : (
        <CrownPrintFinder
          mode={mode}
          rawCode={rawCode}
          code={parsed.code || ""}
          core={core}
          state={state}
          recognized={recognized}
          unrecognized={parsed.unrecognized}
          priorityLabel={fit.priorities[0]?.label ?? "Your routine"}
          priorities={fit.priorities}
          functions={fit.functions}
          gaps={fit.gaps}
          notes={fit.notes}
          cards={cards}
          noStrongMatch={fit.noStrongMatch}
          noFit={fit.noFit}
          whatToLookFor={fit.whatToLookFor}
          shareQuery={profileToQuery(profile)}
          sourceLabel={guidance.label}
          sourceDetail={guidance.detail}
          confidence={guidance.confidence}
          missingAxes={guidance.missingAxes}
        />
        )}

        <section className="cp-education" aria-labelledby="cp-axes-heading">
          <p className="eyebrow">WHAT THE CODE MEANS</p>
          <h2 id="cp-axes-heading">Five axes, one code</h2>
          <p className="cp-lead">
            Your CrownPrint Core is the part of your hair that stays relatively stable. Each letter is one axis and each
            number is its level — so <b>P2</b> is medium porosity, <b>D3</b> is high density, <b>T3</b> is coarse strands.
          </p>
          <div className="cp-axis-table">
            {CORE_AXES.map((axis) => (
              <article key={axis.id}>
                <h3><span aria-hidden="true">{axis.letter}</span> {axis.label}</h3>
                <ul>
                  {axis.levels.map((lvl) => (
                    <li key={lvl.value}><b>{axis.letter}{lvl.level}</b> {lvl.label} — {lvl.blurb}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="cp-edu-note">
            Notice what isn&rsquo;t in the code: your curl pattern. CrownPrint treats how your hair <i>behaves</i> —
            porosity, density, strand thickness, scalp, elasticity — as the thing that decides product fit. And your
            CrownState (your style, your scalp this week, what you&rsquo;re dealing with) is never in the code at all,
            because it&rsquo;s meant to change. That&rsquo;s why we ask for it on this page every time.
          </p>
        </section>

        <section className="cp-education" aria-labelledby="cp-hwl-heading">
          <p className="eyebrow">DON&rsquo;T HAVE A CROWNPRINT YET?</p>
          <h2 id="cp-hwl-heading">The assessment lives at the Hair Wellness Lab</h2>
          <p className="cp-lead">
            CrownPrint™ is a Premium, science-informed hair intelligence assessment. You take it once at the Hair
            Wellness Lab, and it gives you your code, your Intelligence Report, and a CrownState you can update for free
            whenever your hair changes. Then you can shop it here.
          </p>
          <div className="actions">
            <Link className="button" href="/shop-by-crownprint">Get My CrownPrint™</Link>
            <Link className="outline-button" href="/#routine-finder">Try the Routine Finder instead</Link>
          </div>
          <p className="cp-edu-note">
            Wynn Essentials never sees your CrownPrint answers or your Hair Wellness Lab account. On this page, the only
            thing that crosses is what you typed in — and it stays in the link.
          </p>
        </section>
      </main>

      <footer className="pdp-footer">
        <p>
          <Link href="/#shop">Browse all products</Link> · <Link href="/shop-by-crownprint">Shop by CrownPrint</Link> ·{" "}
          <Link href="/#shop-by-concern">Shop by Concern</Link> · <Link href="/privacy">Privacy</Link> ·{" "}
          <Link href="/">Back to home</Link>
        </p>
        <small>
          © {new Date().getFullYear()} Wynn Essentials. All rights reserved. CrownPrint™ assessment and intelligence
          provided in partnership with Hair Wellness Lab.
        </small>
      </footer>
    </div>
  );
}
