import type { Metadata } from "next";
import Link from "next/link";
import { products } from "../data";
import { SITE_URL, ldJson } from "../seo";
import {
  crownprintConfig,
  crownprintIntegrationReady,
  hasStrongMatch,
  readMatchSession,
  type MatchClass,
} from "../../lib/crownprint";
import CrownPrintExperience, { type CardProduct } from "./CrownPrintExperience";

// Reads the (httpOnly) Wynn session cookie to personalize, so per-request.
export const dynamic = "force-dynamic";

const CANONICAL = "/shop-by-crownprint";

// Personalized results are NOT indexable. Crawlers never carry the session
// cookie, so they always see the public educational landing (indexable). When a
// real shopper is connected we additionally mark the page noindex. There is a
// single URL, so no per-result CrownPrint URLs are ever created.
export async function generateMetadata(): Promise<Metadata> {
  const connected = (await readMatchSession()) !== null;
  const title = "Shop by CrownPrint™ | Wynn Essentials";
  const description =
    "Your hair needs more than a porosity label. CrownPrint considers multiple hair characteristics and your current hair state to help identify which Wynn Essentials products may fit what your hair needs right now.";
  return {
    title,
    description,
    alternates: { canonical: CANONICAL },
    robots: connected ? { index: false, follow: true } : undefined,
    openGraph: {
      title, description, url: CANONICAL, siteName: "Wynn Essentials", type: "website",
      images: [{ url: "/og-basket-espresso.jpg", width: 1200, height: 630, alt: "Wynn Essentials" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og-basket-espresso.jpg"] },
  };
}

function landingSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Shop by CrownPrint™ | Wynn Essentials",
    url: `${SITE_URL}${CANONICAL}`,
    description:
      "Shop Wynn Essentials by CrownPrint — an alternative to shopping by porosity that considers multiple hair characteristics and your current hair state to help identify product fit.",
    isPartOf: { "@type": "WebSite", name: "Wynn Essentials", url: SITE_URL },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Shop by CrownPrint", item: `${SITE_URL}${CANONICAL}` },
      ],
    },
  };
}

const CLASS_ORDER: Record<MatchClass, number> = { strong: 0, good: 1, conditional: 2 };

export default async function ShopByCrownPrintPage() {
  // Read the Wynn-side session (populated once, after the one-time HWL exchange).
  // This never re-contacts HWL and never touches the dead connect code.
  const context = await readMatchSession();
  const connected = context !== null;
  const integrationReady = crownprintIntegrationReady();

  // Join safe product keys with the real catalog so cards use actual Wynn
  // Essentials data (image, name, price, URL). Product claims are never changed
  // by CrownPrint — only the fit explanation ("why") is personalized.
  const cards: CardProduct[] = (context?.matches ?? [])
    .map((m): CardProduct | null => {
      const p = products.find((x) => x.slug === m.productKey);
      if (!p) return null; // ignore anything not in the live catalog
      const simple = !(p.colors?.length) && !((p.variants?.length ?? 0) > 1);
      return {
        slug: p.slug,
        name: p.name,
        subtitle: p.subtitle,
        price: p.price,
        image: p.images?.[0] ? { src: p.images[0].src, alt: p.images[0].alt } : null,
        url: `/products/${p.slug}`,
        simple,
        matchClass: m.matchClass,
        why: m.why,
      };
    })
    .filter((c): c is CardProduct => c !== null)
    .sort((a, b) => CLASS_ORDER[a.matchClass] - CLASS_ORDER[b.matchClass]);

  const urls = {
    connect: `${CANONICAL}/connect?start=connect`,
    create: `${CANONICAL}/connect?start=create`,
    refresh: `${CANONICAL}/connect?start=refresh`,
    disconnect: `${CANONICAL}/connect?disconnect=1`,
    productHub: context?.safeLinks?.productHub ?? crownprintConfig.productHubUrl,
  };

  return (
    <div className="legal-page cp-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(landingSchema()) }} />

      <header className="pdp-bar">
        <Link className="pdp-logo" href="/">WYNN ESSENTIALS<span>Healthy Hair Is a Practice</span></Link>
        <Link className="pdp-bar-shop" href="/#shop">Shop all products</Link>
      </header>
      <nav className="pdp-crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link> <span aria-hidden="true">/</span> <span aria-current="page">Shop by CrownPrint™</span>
      </nav>

      <main className="cp-main">
        <section className="cp-hero">
          <p className="eyebrow">SHOP BY CROWNPRINT™</p>
          <h1>Your hair needs more than a porosity label.</h1>
          <p className="cp-lead">
            CrownPrint considers multiple characteristics and your current hair state to help identify
            which Wynn Essentials products may fit what your hair needs right now. It&rsquo;s an
            alternative to shopping by porosity alone.
          </p>
          <p className="cp-disclaimer">
            This is product-fit guidance, not medical advice, clinical validation, or a diagnosis. Everyone&rsquo;s hair is different — patch test and read each product&rsquo;s ingredient list.
          </p>
        </section>

        <CrownPrintExperience
          integrationReady={integrationReady}
          connected={connected}
          crownPrintPresent={context?.crownPrintPresent ?? false}
          crownStateFresh={context?.crownState.fresh ?? true}
          crownStateMessage={context?.crownState.message}
          currentPriorityLabel={context?.currentPriorityLabel}
          noStrongMatch={context?.noStrongMatch ?? false}
          whatToLookFor={context?.whatToLookFor}
          hasStrong={context ? hasStrongMatch(context) : false}
          products={cards}
          urls={urls}
        />

        <section className="cp-education" aria-labelledby="cp-edu-heading">
          <p className="eyebrow">HOW CROWNPRINT WORKS</p>
          <h2 id="cp-edu-heading">Why your recommendations can change</h2>
          <div className="cp-edu-grid">
            <article><h3>CrownPrint Core</h3><p>Your foundational hair characteristics — the things that stay relatively consistent over time.</p></article>
            <article><h3>CrownState</h3><p>What appears to be happening with your hair right now, which can shift with styling, seasons, and care.</p></article>
            <article><h3>CrownHistory</h3><p>Relevant recent context — the styles, services, and changes your hair has been through lately.</p></article>
            <article><h3>Wynn Essentials Match™</h3><p>Uses these signals to identify current product fit, so guidance reflects what your hair needs now — not a single fixed label.</p></article>
          </div>
          <p className="cp-edu-note">
            CrownPrint, CrownState, CrownHistory, and the CrownPrint assessment live in the Hair Wellness Lab. Wynn Essentials uses your safe match result only to help you shop.
          </p>
        </section>
      </main>

      <footer className="pdp-footer">
        <p><Link href="/#shop">Browse all products</Link> · <Link href="/#shop-by-concern">Shop by Concern</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/">Back to home</Link></p>
        <small>© {new Date().getFullYear()} Wynn Essentials. All rights reserved. CrownPrint™ assessment and intelligence provided in partnership with Hair Wellness Lab.</small>
      </footer>
    </div>
  );
}
