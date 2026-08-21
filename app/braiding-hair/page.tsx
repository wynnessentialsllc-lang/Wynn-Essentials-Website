import type { Metadata } from "next";
import Link from "next/link";
import { products } from "../data";
import { SITE_URL, ldJson } from "../seo";
import { isPreorderEligible } from "../../lib/preorder";

export const metadata: Metadata = {
  title: "Braiding Hair — Premium Human Hair Bulk | Wynn Essentials",
  description: "Premium human hair bulk for boho braids, knotless styles, and protective installs — Body Wave, Bohemian Curl, Deep Wave, and Spanish Curl textures.",
  alternates: { canonical: "/braiding-hair" },
  openGraph: { title: "Braiding Hair — Premium Human Hair Bulk | Wynn Essentials", description: "Premium human hair bulk for boho braids, knotless styles, and protective installs.", url: "/braiding-hair", siteName: "Wynn Essentials", type: "website" },
};

const money = (v: number | null) => (v == null ? "Price to be confirmed" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v));
const BUNDLE_GUIDE: [string, string][] = [["Standard installation", "2 bundles"], ["Full to voluminous look", "3–4 bundles"], ["All human-hair boho braids", "4–6 bundles"]];
const CARE_GUIDE = [
  ["Detangle gently", "Work in small sections with your fingers or a wide-tooth comb. Start at the ends and move upward without pulling through knots."],
  ["Use lightweight moisture", "Refresh the loose hair with a light water mist or lightweight leave-in. Avoid heavy oils and thick products that cause buildup."],
  ["Protect it at night", "Loosely gather your braids and cover them with a satin scarf or bonnet. A satin pillowcase provides extra protection."],
  ["Clean with care", "When needed, cleanse gently with diluted shampoo, focusing on the scalp. Do not scrub or bunch the loose hair."],
  ["Limit heat", "Use a heat protectant and low temperature if restyling. Frequent or excessive heat can permanently loosen the original curl pattern."],
  ["Dry completely", "Never sleep on wet or damp hair. Allow the braids and loose pieces to dry fully to help prevent tangling, matting, and odor."],
] as const;

export default function BraidingHairPage() {
  const hair = products.filter(p => p.kind === "hair");
  const itemList = { "@context": "https://schema.org", "@type": "ItemList", name: "Braiding Hair", itemListElement: hair.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: `${p.name} ${p.subtitle}`, url: `${SITE_URL}/products/${p.slug}` })) };

  return <div className="collection braiding-hair-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(itemList) }} />
    <header className="collection-bar"><Link className="pdp-logo" href="/">WYNN ESSENTIALS<span>Healthy Hair Is a Practice</span></Link><Link className="pdp-bar-shop" href="/#shop">Shop all products</Link></header>
    <nav className="pdp-crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link> <span aria-hidden="true">/</span> <span aria-current="page">Braiding Hair</span></nav>
    <main id="main">
      <section className="collection-hero"><p className="eyebrow">PREMIUM HUMAN HAIR</p><h1>Braiding Hair</h1><p>Premium human hair bulk for boho braids, knotless styles, and dimensional protective installs. Choose your texture, then pick length and color where available.</p></section>
      <section className="collection-grid" aria-label="Braiding hair textures">{hair.map(p => {
        const variants = p.variants ?? [];
        const prices = variants.length ? variants.map(v => v.price) : (p.price != null ? [p.price] : []);
        const min = prices.length ? Math.min(...prices) : null;
        const max = prices.length ? Math.max(...prices) : null;
        const lengths = [...new Set(variants.map(v => v.length))];
        const colors = [...new Set(variants.map(v => v.color))];
        const allOut = p.soldOut || (variants.length > 0 && variants.every(v => v.soldOut));
        const preorder = isPreorderEligible(p.slug);
        const img = p.images?.[0];
        return <article className="collection-card" key={p.slug}>
          <Link href={`/products/${p.slug}`} className="collection-art" aria-label={`View ${p.name} details`}>{img ? <img src={img.src} alt={img.alt} width={1200} height={1500} loading="lazy" /> : <span className="collection-art-fallback" aria-hidden="true" />}{allOut && !preorder && <span className="sold-out-badge">Sold Out</span>}</Link>
          <div className="collection-card-body"><p className="eyebrow">BOHO BRAID HAIR</p><h2>{p.name}</h2><p className="collection-sub">{p.subtitle}</p><p className="collection-meta">{lengths.join(", ") || p.size}{colors.length ? ` · ${colors.join(", ")}` : ""}</p><strong className="collection-price">{min == null ? "Price to be confirmed" : min === max ? money(min) : `From ${money(min)}`}</strong><div className="collection-actions"><Link className="button" href={preorder || allOut ? `/products/${p.slug}` : `/#product-${p.slug}`}>{preorder ? "PRE-ORDER" : allOut ? "Join the Waitlist" : "Shop This Texture"}</Link></div></div>
        </article>;
      })}</section>
      <section className="collection-guide" aria-labelledby="bundle-guide"><h2 id="bundle-guide">How many bundles do I need?</h2><p>Each bundle is approximately <strong>90–100g</strong>. Use these as a starting point — your stylist, hair size, and desired fullness change the exact count, so when in doubt, order one extra bundle.</p><table><thead><tr><th>Style</th><th>Typical bundles</th></tr></thead><tbody>{BUNDLE_GUIDE.map(([style, count]) => <tr key={style}><td>{style}</td><td>{count}</td></tr>)}</tbody></table><p className="collection-fine">Guidance only, not a guarantee. Each pack contains one bundle unless noted.</p></section>
      <section className="collection-guide collection-care-guide" id="care-guide" aria-labelledby="care-guide-heading"><p className="eyebrow">BOHO HAIR CARE</p><h2 id="care-guide-heading">Keep your hair soft, defined, and beautiful</h2><p>Boho Hair is human hair, so gentle and consistent care helps preserve its movement, curl pattern, and softness throughout your style.</p><div className="collection-care-grid">{CARE_GUIDE.map(([title, copy]) => <article key={title}><h3>{title}</h3><p>{copy}</p></article>)}</div><p className="collection-fine"><strong>Stylist tip:</strong> Ask your braider for care instructions specific to your installation method and desired wear time.</p></section>
      <section className="collection-guide collection-good-to-know" aria-labelledby="good-to-know-heading"><p className="eyebrow">GOOD TO KNOW</p><h2 id="good-to-know-heading">Boho Hair questions, answered</h2><details><summary>Is this synthetic or human hair?</summary><p>These Boho Hair textures are premium human hair bulk, selected for braids and dimensional protective styles.</p></details><details><summary>Can I wash or restyle the loose hair?</summary><p>Yes, gently. Use lightweight products, avoid aggressive rubbing, dry completely, and keep heat low with a protectant. Heat and repeated manipulation can loosen the original texture.</p></details><details><summary>Will every bundle look exactly the same?</summary><p>Because this is human hair, slight variations in natural color and curl pattern are normal. Ordering your full quantity together helps create the most cohesive finished look.</p></details><details><summary>What if I am unsure how many bundles to order?</summary><p>Ask your stylist before purchasing. Braid size, head size, desired fullness, and how much loose hair is added all affect the final quantity.</p></details><details><summary>When will my pre-order ship?</summary><p>Pre-orders close every Friday at 12 PM PT. Please allow approximately 7–13 days for processing before shipment. Tracking is emailed once your order is on the way.</p></details></section>
    </main>
    <footer className="pdp-footer"><p><Link href="/#shop">Browse all products</Link> · <Link href="/#routine-finder">Find your routine</Link> · <Link href="/">Back to home</Link></p><small>© {new Date().getFullYear()} Wynn Essentials. All rights reserved.</small></footer>
  </div>;
}
