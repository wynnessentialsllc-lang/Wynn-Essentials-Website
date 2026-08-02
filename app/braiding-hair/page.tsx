import type { Metadata } from "next";
import Link from "next/link";
import { products } from "../data";
import { SITE_URL } from "../seo";

export const metadata: Metadata = {
  title: "Braiding Hair — Premium Human Hair Bulk | Wynn Essentials",
  description: "Premium human hair bulk for boho braids, knotless styles, and protective installs — Body Wave, Bohemian Curl, Deep Wave, and Spanish Curl textures.",
  alternates: { canonical: "/braiding-hair" },
  openGraph: {
    title: "Braiding Hair — Premium Human Hair Bulk | Wynn Essentials",
    description: "Premium human hair bulk for boho braids, knotless styles, and protective installs.",
    url: "/braiding-hair",
    siteName: "Wynn Essentials",
    type: "website",
  },
};

const money = (v: number | null) => (v == null ? "Price to be confirmed" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v));

// Guidance shoppers ask for constantly. Each bundle is ~90–100g; counts below
// reflect that. A disclaimer keeps it honest.
const BUNDLE_GUIDE: [string, string][] = [
  ["Standard installation", "2 bundles"],
  ["Full to voluminous look", "3–4 bundles"],
  ["All human-hair boho braids", "4–6 bundles"],
];

export default function BraidingHairPage() {
  const hair = products.filter(p => p.kind === "hair");

  // ItemList structured data helps this collection surface in search.
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Braiding Hair",
    itemListElement: hair.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: `${p.name} ${p.subtitle}`, url: `${SITE_URL}/products/${p.slug}` })),
  };

  return (
    <div className="collection">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />

      <header className="collection-bar">
        <Link className="pdp-logo" href="/">WYNN ESSENTIALS<span>Healthy Hair Is a Practice</span></Link>
        <Link className="pdp-bar-shop" href="/#shop">Shop all products</Link>
      </header>

      <nav className="pdp-crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link> <span aria-hidden="true">/</span> <span aria-current="page">Braiding Hair</span>
      </nav>

      <section className="collection-hero">
        <p className="eyebrow">PREMIUM HUMAN HAIR</p>
        <h1>Braiding Hair</h1>
        <p>Premium human hair bulk for boho braids, knotless styles, and dimensional protective installs. Choose your texture, then pick length and color where available.</p>
      </section>

      <section className="collection-grid" aria-label="Braiding hair textures">
        {hair.map(p => {
          const variants = p.variants ?? [];
          const prices = variants.length ? variants.map(v => v.price) : (p.price != null ? [p.price] : []);
          const min = prices.length ? Math.min(...prices) : null;
          const max = prices.length ? Math.max(...prices) : null;
          const lengths = [...new Set(variants.map(v => v.length))];
          const colors = [...new Set(variants.map(v => v.color))];
          const allOut = p.soldOut || (variants.length > 0 && variants.every(v => v.soldOut));
          const img = p.images?.[0];
          return (
            <article className="collection-card" key={p.slug}>
              <Link href={`/products/${p.slug}`} className="collection-art" aria-label={`View ${p.name} details`}>
                {img ? <img src={img.src} alt={img.alt} width={1200} height={1500} loading="lazy" /> : <span className="collection-art-fallback" aria-hidden="true" />}
                {allOut && <span className="sold-out-badge">Sold Out</span>}
              </Link>
              <div className="collection-card-body">
                <p className="eyebrow">BOHO BRAID HAIR</p>
                <h2>{p.name}</h2>
                <p className="collection-sub">{p.subtitle}</p>
                <p className="collection-meta">{lengths.join(", ") || p.size}{colors.length ? ` · ${colors.join(", ")}` : ""}</p>
                <strong className="collection-price">{min == null ? "Price to be confirmed" : min === max ? money(min) : `From ${money(min)}`}</strong>
                <div className="collection-actions">
                  <Link className="button" href={`/#product-${p.slug}`}>{allOut ? "Join the Waitlist" : "Shop This Texture"}</Link>
                  <Link className="pdp-bar-shop" href={`/products/${p.slug}`}>Details</Link>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="collection-guide" aria-labelledby="bundle-guide">
        <h2 id="bundle-guide">How many bundles do I need?</h2>
        <p>Each bundle is approximately <strong>90–100g</strong>. Use these as a starting point — your stylist, hair size, and desired fullness change the exact count, so when in doubt, order one extra bundle.</p>
        <table>
          <thead><tr><th>Style</th><th>Typical bundles</th></tr></thead>
          <tbody>{BUNDLE_GUIDE.map(([style, count]) => <tr key={style}><td>{style}</td><td>{count}</td></tr>)}</tbody>
        </table>
        <p className="collection-fine">Guidance only, not a guarantee. Each pack contains one bundle unless noted.</p>
      </section>

      <footer className="pdp-footer">
        <p><Link href="/#shop">Browse all products</Link> · <Link href="/#routine-finder">Find your routine</Link> · <Link href="/">Back to home</Link></p>
        <small>© {new Date().getFullYear()} Wynn Essentials. All rights reserved.</small>
      </footer>
    </div>
  );
}
