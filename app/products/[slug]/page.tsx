import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { products, Product } from "../../data";
import { reviewsFor, summarize } from "../../reviews";
import { productSchema, breadcrumbSchema, ldJson } from "../../seo";
import PayInFour from "../../PayInFour";
import WishlistButton from "../../WishlistButton";
import WaitlistForm from "./WaitlistForm";
import ProductPageReviews from "./ProductPageReviews";

// Pre-render one static page per catalog product. Each gets its own crawlable
// URL, unique metadata, and Product structured data — the pieces the modal-only
// storefront could not give search engines or AI assistants.
export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

const findProduct = (slug: string): Product | undefined => products.find((p) => p.slug === slug);
const money = (value: number | null) => (value == null ? "Price to be confirmed" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value));
const clip = (text: string, max = 155) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = findProduct(slug);
  if (!product) return { title: "Product not found | Wynn Essentials" };

  const title = `${product.name} ${product.subtitle} | Wynn Essentials`;
  const description = clip(product.benefit ? `${product.benefit} ${product.description}` : product.description);
  const image = product.images?.[0]?.src ?? "/og-basket-espresso.jpg";

  return {
    title,
    description,
    alternates: { canonical: `/products/${slug}` },
    openGraph: {
      title,
      description,
      url: `/products/${slug}`,
      siteName: "Wynn Essentials",
      type: "website",
      images: [{ url: image, width: 1200, height: 1200, alt: product.images?.[0]?.alt ?? `${product.name} ${product.subtitle}` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = findProduct(slug);
  if (!product) notFound();

  // Gallery-only entries carry a customer video but no written body, so they
  // aren't shown as cards or counted in the rating here.
  const reviews = reviewsFor(product.slug).filter((r) => !r.galleryOnly);
  const summary = summarize(reviews);
  const isHair = !product.kind;
  const shopHref = `/#product-${product.slug}`;
  const gallery = product.images ?? [];

  return (
    <div className="pdp">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(productSchema(product)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbSchema(product)) }} />

      <header className="pdp-bar">
        <Link className="pdp-logo" href="/">WYNN ESSENTIALS<span>Healthy Hair Is a Practice</span></Link>
        <Link className="pdp-bar-shop" href="/#shop">Shop all products</Link>
      </header>

      <nav className="pdp-crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link> <span aria-hidden="true">/</span> <Link href="/#shop">Shop</Link> <span aria-hidden="true">/</span> <span aria-current="page">{product.name}</span>
      </nav>

      <main className="pdp-main">
        <div className={`pdp-gallery${product.kind === "hair" ? " pdp-gallery--contain" : ""}`}>
          {gallery.length ? gallery.map((img, i) => (
            <img key={img.src} src={img.src} alt={img.alt} width={1200} height={1200} loading={i === 0 ? undefined : "lazy"} />
          )) : (
            <div className="pdp-gallery-placeholder" role="img" aria-label={`${product.name} ${product.subtitle}`} />
          )}
        </div>

        <div className="pdp-info">
          <p className="eyebrow">{isHair ? `THE WYNN METHOD · STEP ${product.methodStep} OF 6` : product.subtitle.toUpperCase()}</p>
          <h1>{product.name}<span>{product.subtitle}</span></h1>
          <p className="pdp-price">{money(product.price)}{product.size && ` · ${product.size}`}</p>
          <PayInFour price={product.price} />

          {summary.count > 0 && (
            <p className="pdp-rating" aria-label={`Rated ${summary.average} out of 5 from ${summary.count} reviews`}>
              <span aria-hidden="true">{"★".repeat(Math.round(summary.average))}{"☆".repeat(5 - Math.round(summary.average))}</span>
              {" "}{summary.average.toFixed(1)} · {summary.count} review{summary.count === 1 ? "" : "s"}
            </p>
          )}

          <p className="pdp-benefit">{product.benefit}</p>
          <p>{product.description}</p>

          {product.variants && product.variants.length > 1 && (
            <p className="pdp-variants"><strong>{product.variantLabel ?? "Options"}:</strong> {product.variants.map((v) => v.length).join(" · ")} — all {money(product.variants[0].price)}. Choose your set on the shop page.</p>
          )}

          {product.soldOut ? (
            <div className="pdp-waitlist">
              <WaitlistForm slug={product.slug} name={product.name} />
              <WishlistButton slug={product.slug} name={product.name} />
            </div>
          ) : (
            <p className="pdp-actions">
              <Link className="button" href={shopHref}>Shop This Product</Link>
              <WishlistButton slug={product.slug} name={product.name} />
            </p>
          )}

          {product.directions && (
            <section className="pdp-block">
              <h2>How to use</h2>
              <p>{product.directions}</p>
            </section>
          )}

          {product.ingredients.length > 0 && (
            <section className="pdp-block">
              <h2>Ingredients</h2>
              <p className="pdp-ingredients">{product.ingredients.join(", ")}.</p>
            </section>
          )}

          {(product.concerns.length > 0 || product.styles.length > 0) && (
            <section className="pdp-block pdp-tags">
              {product.concerns.length > 0 && <p><strong>Targets:</strong> {product.concerns.join(", ")}</p>}
              {product.styles.length > 0 && <p><strong>Made for:</strong> {product.styles.join(", ")}</p>}
            </section>
          )}
        </div>
      </main>

      <ProductPageReviews slug={product.slug} />

      <footer className="pdp-footer">
        <p>Part of the Wynn Essentials collection for textured hair.</p>
        <p><Link href="/#shop">Browse all products</Link> · <Link href="/#routine-finder">Find your routine</Link> · <Link href="/">Back to home</Link></p>
        <small>© {new Date().getFullYear()} Wynn Essentials. All rights reserved.</small>
      </footer>
    </div>
  );
}
