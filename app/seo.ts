// Shared SEO helpers: the canonical site origin, reusable schema.org builders,
// and the FAQ content that backs both the Help Center modal and FAQ structured
// data. Keeping these in one place means the product pages, sitemap, layout, and
// storefront all agree on URLs and structured data.
// `Product` is a type-only import: under `isolatedModules` (and Node's type
// stripping, which the tests run under) it has to be marked as one so the
// runtime import does not look for a value that was never emitted.
import { products, type Product } from "./data";
import { reviewsFor, summarize } from "./reviews";

// The canonical apex host. Everything else (metadataBase, canonical URLs, the
// sitemap, robots, and every absolute URL inside structured data) derives from
// this so there is a single source of truth. No trailing slash.
export const SITE_URL = "https://wynnessentialsllc.us";

// Turn a site-relative path ("/products/x.png") into an absolute URL. Structured
// data must use absolute URLs; relative paths are silently ignored by crawlers.
export const abs = (path: string) => (path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`);

// Serialize a schema object for embedding in a <script> tag. Escapes the
// characters that could otherwise break out of the script element ("<", ">",
// "&") plus the JS line separators, so a stray "</script>" in any field can
// never terminate the tag. Use this everywhere instead of raw JSON.stringify.
export const ldJson = (obj: unknown) =>
  JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

// ItemList for the homepage shop grid, so the primary catalog is a legible
// product list to search engines even though it renders inside a client
// component. Excludes bundles/accessories? No — lists everything purchasable.
export function shopItemListSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Shop Wynn Essentials",
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: productUrl(p.slug),
      name: `${p.name} ${p.subtitle}`,
    })),
  };
}

// The canonical, crawlable URL for a single product page.
export const productUrl = (slug: string) => `${SITE_URL}/products/${slug}`;

// Social + contact links, reused by the Organization schema and the footer.
export const social = {
  instagram: "https://www.instagram.com/wynnessentials/",
  tiktok: "https://www.tiktok.com/@wynnessentials",
  email: "wynnessentialsllc@gmail.com",
  phone: "+12132670825",
};

// The published shipping terms, expressed as schema.org so a shopping agent can
// answer "does this ship to me and what does it cost" without reading /shipping.
// Mirrors app/shipping/page.tsx — change both together.
const shippingDetails = {
  "@type": "OfferShippingDetails",
  shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
  shippingRate: { "@type": "MonetaryAmount", currency: "USD", value: "0", description: "Free standard shipping on U.S. orders over $50. Standard and expedited rates are shown at checkout." },
  deliveryTime: {
    "@type": "ShippingDeliveryTime",
    handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 3, unitCode: "DAY" },
  },
};

// The published return terms. All sales are final apart from transit damage or
// an incorrect item, so the honest category is MerchantReturnNotPermitted with
// the exception spelled out. Mirrors app/returns/page.tsx.
const returnPolicy = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "US",
  returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
  merchantReturnLink: `${SITE_URL}/returns`,
  description: "All sales are final. Returns and exchanges are limited to merchandise damaged in transit or an incorrect item sent by Wynn Essentials. Contact us within 5 calendar days after delivery; eligible items must remain unused and in their original packaging.",
};

// Organization / brand identity. Google and AI assistants use this to connect
// the storefront to a real business, its logo, and its social profiles.
// Typed as OnlineStore (a subtype of Organization) rather than a bare
// Organization: shopping assistants use that to tell a storefront apart from a
// content site, and it carries the same properties.
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: "Wynn Essentials",
    legalName: "Wynn Essentials LLC",
    url: SITE_URL,
    logo: abs("/wynn-essentials-logo.jpeg"),
    image: abs("/og-basket-espresso.jpg"),
    description: "Wynn Essentials makes moisture, strength, scalp, and styling essentials for textured hair and the routines that keep it healthy.",
    slogan: "Healthy hair is a practice.",
    foundingDate: "2020",
    founders: ["Patricia Wynn", "Karina Wynn", "Sheree Wynn"].map((name) => ({ "@type": "Person", name })),
    knowsAbout: ["Textured hair care", "Natural hair", "Protective styles", "Scalp care", "Curly hair"],
    // The store ships within the United States only, and it is made for
    // textured-hair routines. Both are things an assistant should check before
    // recommending the brand to someone.
    areaServed: { "@type": "Country", name: "US" },
    audience: { "@type": "PeopleAudience", name: "Textured hair", audienceType: "People with curls, coils, braids, locs, twists, silk presses, wigs, weaves, and other protective styles" },
    hasMerchantReturnPolicy: returnPolicy,
    address: { "@type": "PostalAddress", addressLocality: "Los Angeles", addressRegion: "CA", addressCountry: "US" },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      email: social.email,
      telephone: social.phone,
      areaServed: "US",
      availableLanguage: "English",
    },
    sameAs: [social.instagram, social.tiktok],
  };
}

// Site-level entity so search engines have a named WebSite for the domain.
export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Wynn Essentials",
    url: SITE_URL,
    inLanguage: "en-US",
    publisher: { "@type": "Organization", name: "Wynn Essentials", url: SITE_URL },
  };
}

// Who a product is for, in schema.org terms. Assistants use `audience` to
// decide whether a shopper matches before recommending — so it carries the
// product's own concerns and styles, not a generic brand blurb.
function audienceFor(product: Product) {
  const parts = [...product.concerns, ...product.styles];
  return {
    "@type": "PeopleAudience",
    name: "Textured hair",
    audienceType: parts.length ? `Textured-hair routines — ${parts.join(", ")}` : "Textured-hair routines",
  };
}

// Product structured data with price, availability, shipping and return terms,
// the audience it is made for, and — when a product has reviews — an aggregate
// rating and the reviews themselves. This is what powers Google's price/rating
// rich results and what lets an assistant compare products and recommend one.
export function productSchema(product: Product) {
  // Exclude gallery-only entries (video clips with no written body) so they
  // don't inflate the aggregate rating or emit an empty Review node.
  const reviews = reviewsFor(product.slug).filter((r) => !r.galleryOnly);
  const summary = summarize(reviews);
  const images = product.images?.length ? product.images.map((i) => abs(i.src)) : [abs("/og-basket-espresso.jpg")];

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${product.name} ${product.subtitle}`,
    description: product.description,
    image: images,
    sku: product.slug,
    category: product.category,
    brand: { "@type": "Brand", name: "Wynn Essentials" },
    url: productUrl(product.slug),
    audience: audienceFor(product),
    // The facts an assistant needs to match a product to a shopper's situation,
    // exposed as named properties rather than buried in prose.
    additionalProperty: [
      ...(product.size ? [{ "@type": "PropertyValue", name: "Size", value: product.size }] : []),
      ...(product.methodStep ? [{ "@type": "PropertyValue", name: "Wynn Method step", value: `Step ${product.methodStep} of 6` }] : []),
      ...(product.concerns.length ? [{ "@type": "PropertyValue", name: "Addresses", value: product.concerns.join(", ") }] : []),
      ...(product.styles.length ? [{ "@type": "PropertyValue", name: "Made for styles", value: product.styles.join(", ") }] : []),
      ...(product.bundleIncludes?.length ? [{ "@type": "PropertyValue", name: "Includes", value: product.bundleIncludes.join(", ") }] : []),
    ],
    // Let a crawler walk from one product to the rest of the routine instead of
    // treating each page as an island.
    isRelatedTo: products
      .filter((other) => other.slug !== product.slug && other.concerns.some((c) => product.concerns.includes(c)))
      .slice(0, 4)
      .map((other) => ({ "@type": "Product", name: `${other.name} ${other.subtitle}`, url: productUrl(other.slug) })),
  };

  if (product.price != null) {
    schema.offers = {
      "@type": "Offer",
      url: productUrl(product.slug),
      priceCurrency: "USD",
      price: product.price.toFixed(2),
      availability: product.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "Wynn Essentials" },
      areaServed: { "@type": "Country", name: "US" },
      shippingDetails,
      hasMerchantReturnPolicy: returnPolicy,
    };
  }

  if (summary.count > 0) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: summary.average.toFixed(1),
      reviewCount: summary.count,
      bestRating: "5",
      worstRating: "1",
    };
    schema.review = reviews.map((r) => ({
      "@type": "Review",
      reviewRating: { "@type": "Rating", ratingValue: String(r.rating), bestRating: "5", worstRating: "1" },
      author: { "@type": "Person", name: r.author },
      ...(r.date ? { datePublished: r.date } : {}),
      ...(r.title ? { name: r.title } : {}),
      reviewBody: r.body,
    }));
  }

  return schema;
}

// Breadcrumb trail for a product page: Home › Shop › Product.
export function breadcrumbSchema(product: Product) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Shop", item: `${SITE_URL}/#shop` },
      { "@type": "ListItem", position: 3, name: `${product.name} ${product.subtitle}`, item: productUrl(product.slug) },
    ],
  };
}

// Frequently asked questions, mirrored from the on-site Help Center. Exposed as
// FAQPage structured data so assistants can answer shipping, returns, and
// product questions about Wynn Essentials directly.
export const faqs: { q: string; a: string }[] = [
  { q: "How long until my order ships?", a: "Most orders require up to 3 business days for processing. Boho Hair orders require 3–7 business days for processing. Carrier transit time begins after processing is complete." },
  { q: "Where do you ship?", a: "We currently ship within the United States only. U.S. orders over $50 qualify for free standard shipping; standard and expedited rates are shown at checkout." },
  { q: "Can I change or cancel an order?", a: "Contact us immediately with your order number. Changes aren't guaranteed once processing or fulfillment begins." },
  { q: "What is your return policy?", a: "All sales are final. Returns and exchanges are limited to merchandise damaged in transit or an incorrect item sent by Wynn Essentials. Contact us within 5 calendar days after delivery; eligible items must remain unused and in their original packaging." },
  { q: "How are refunds issued?", a: "If a refund for transit damage is approved after inspection, it is issued to the original payment method. Bank processing time may vary." },
  { q: "Who are the products made for?", a: "Wynn Essentials supports textured-hair routines — curls, coils, braids, locs, twists, silk presses, wigs, weaves, and other protective styles." },
  { q: "How do I choose the right products?", a: "Use the on-site Routine Finder, or explore products by concern and by routine step in The Wynn Method." },
  { q: "Are your products safe for color-treated or sensitive scalps?", a: "Our formulas use familiar botanicals and purposeful oils, but everyone is different. Patch test first, review the ingredient list on each product page, and stop use if irritation occurs." },
  { q: "What payment methods do you accept?", a: "Checkout is handled securely by Stripe and accepts major cards. We never see or store your full card number on this website." },
  { q: "Do I need an account to order?", a: "No — you can check out as a guest. Your confirmation and tracking are sent to the email you enter at checkout." },
];

export function faqSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

// Guard: keep the FAQ source in sync with the real catalog so a bad edit fails
// loudly at build rather than shipping empty structured data.
export const allProductSlugs = products.map((p) => p.slug);
