// The agent-facing view of the site.
//
// AI assistants and shopping agents discover a storefront differently from a
// human: they crawl a small number of machine-readable entry points, then fetch
// only the pages those entry points point at. This module is the single source
// of truth for that surface, so the sitemap, /llms.txt, /llms-full.txt, and
// /api/catalog can never drift apart or quietly omit a page.
//
// Nothing here may claim more about a product than app/data.ts already says —
// every fact below is derived from the catalog, the reviews, or the published
// policy pages.
import { products, method, type Product } from "../app/data";
import { SITE_URL, productUrl, social } from "../app/seo";
import { reviewsFor, summarize } from "../app/reviews";

// ---------------------------------------------------------------------------
// Page inventory
// ---------------------------------------------------------------------------

export type PageSection = "Shop" | "Find the right products" | "Learn" | "Policies and support";

export type AgentPage = {
  /** Site-relative path, no trailing slash. "/" is the storefront home. */
  path: string;
  title: string;
  /** One line telling an agent what it will find if it fetches this page. */
  summary: string;
  section: PageSection;
  priority: number;
  changeFrequency: "weekly" | "monthly" | "yearly";
};

// Every indexable page that is not generated from the catalog or the blog.
// Adding a public route means adding it here — the sitemap and /llms.txt both
// read this list, and tests/agent-discovery.test.mjs fails the build if a page
// under app/ is missing from it.
export const staticPages: AgentPage[] = [
  { path: "/", title: "Wynn Essentials — Healthy Hair Is a Practice", summary: "The full storefront: every product, The Wynn Method routine steps, shop by concern, shop by style, the Routine Finder, the ingredient library, and customer reviews.", section: "Shop", priority: 1, changeFrequency: "weekly" },
  { path: "/braiding-hair", title: "Braiding Hair — Premium Human Hair Bulk", summary: "Human hair bulk for boho braids, knotless styles, and protective installs — Body Wave, Bohemian Curl, Deep Wave, and Spanish Curl textures.", section: "Shop", priority: 0.8, changeFrequency: "weekly" },
  { path: "/crownprint", title: "CrownPrint — Your Five-Axis Hair Profile", summary: "What the five CrownPrint axes mean and how a CrownPrint code describes a head of hair. Personalized results share this URL and are excluded from indexing.", section: "Find the right products", priority: 0.8, changeFrequency: "weekly" },
  { path: "/shop-by-crownprint", title: "Shop by CrownPrint", summary: "How Wynn Essentials matches products to a shopper's CrownPrint profile. Personalized results share this URL and are excluded from indexing.", section: "Find the right products", priority: 0.8, changeFrequency: "weekly" },
  { path: "/blog", title: "Wynn Essentials Insights", summary: "Routine guides, ingredient education, and protective-style care for textured hair.", section: "Learn", priority: 0.7, changeFrequency: "weekly" },
  { path: "/about", title: "About Wynn Essentials", summary: "A Black women-owned, family-run hair-care brand founded by the Wynn Sisters, and the philosophy behind Healthy Hair Is a Practice.", section: "Learn", priority: 0.6, changeFrequency: "monthly" },
  { path: "/shipping", title: "Shipping Policy", summary: "United States shipping only. Processing takes up to 3 business days; Boho Hair takes 3–7. U.S. orders over $50 ship free standard.", section: "Policies and support", priority: 0.4, changeFrequency: "yearly" },
  { path: "/returns", title: "Returns and Exchanges", summary: "All sales are final. Returns and exchanges are limited to merchandise damaged in transit or an incorrect item sent by Wynn Essentials, reported within 5 calendar days of delivery.", section: "Policies and support", priority: 0.4, changeFrequency: "yearly" },
  { path: "/refunds", title: "Refund Policy", summary: "Which items are eligible for a refund and how an approved refund is issued.", section: "Policies and support", priority: 0.4, changeFrequency: "yearly" },
  { path: "/contact-information", title: "Contact Wynn Essentials", summary: "Email, phone, and business contact details for customer service.", section: "Policies and support", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", title: "Website Terms", summary: "The terms that apply to using the site and placing orders.", section: "Policies and support", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", title: "Privacy Notice", summary: "How personal information is collected, used, and protected, and how to exercise privacy rights.", section: "Policies and support", priority: 0.2, changeFrequency: "yearly" },
  { path: "/cookies", title: "Cookie Information", summary: "How the site uses cookies and browser storage, and how to control them.", section: "Policies and support", priority: 0.2, changeFrequency: "yearly" },
  { path: "/accessibility", title: "Accessibility", summary: "The commitment to an accessible website and how to report a barrier.", section: "Policies and support", priority: 0.2, changeFrequency: "yearly" },
];

/** One page entry per catalog product, in catalog order. */
export const productPages = (): AgentPage[] =>
  products.map((p) => ({
    path: `/products/${p.slug}`,
    title: `${p.name} ${p.subtitle}`,
    summary: p.benefit,
    section: "Shop" as const,
    priority: 0.8,
    changeFrequency: "weekly" as const,
  }));

/** Every indexable page the site publishes, apart from individual blog posts. */
export const allPages = (): AgentPage[] => [...staticPages, ...productPages()];

export const pageUrl = (path: string) => (path === "/" ? SITE_URL : `${SITE_URL}${path}`);

// ---------------------------------------------------------------------------
// Live availability
// ---------------------------------------------------------------------------

// The catalog's `soldOut` flag is only a baseline; /admin/inventory is the live
// source of truth and overrides it in both directions. Agents quoting stock
// need the same answer the storefront shows, so read the same table. Fails open
// to the catalog baseline when the database is unavailable.
export async function liveSoldOut(): Promise<Set<string>> {
  const out = new Set(products.filter((p) => p.soldOut).map((p) => p.slug));
  try {
    const { getDb } = await import("../db");
    const { productInventory } = await import("../db/schema");
    for (const row of await getDb().select().from(productInventory)) {
      if (row.soldOut || (row.stock != null && row.stock <= 0)) out.add(row.slug);
      else out.delete(row.slug);
    }
  } catch {
    /* keep the catalog baseline */
  }
  return out;
}

// ---------------------------------------------------------------------------
// Product records
// ---------------------------------------------------------------------------

export type AgentProduct = ReturnType<typeof productRecord>;

/** A product flattened into the fields an assistant needs to recommend it. */
export function productRecord(product: Product, soldOut: boolean) {
  const reviews = reviewsFor(product.slug).filter((r) => !r.galleryOnly);
  const rating = summarize(reviews);
  return {
    slug: product.slug,
    name: `${product.name} ${product.subtitle}`,
    url: productUrl(product.slug),
    category: product.category,
    kind: product.kind ?? "haircare",
    // Which step of the six-step Wynn Method this belongs to. 0 means the item
    // sits outside the routine (accessories, bundles, braiding hair).
    routineStep: product.methodStep || null,
    routineStepName: product.methodStep ? method[product.methodStep - 1][0] : null,
    benefit: product.benefit,
    description: product.description,
    directions: product.directions,
    size: product.size,
    price: product.price,
    currency: "USD",
    availability: soldOut ? "out_of_stock" : "in_stock",
    // What a shopper is trying to solve, and which styles the product is made
    // for. These two lists are how an assistant should route a recommendation.
    concerns: product.concerns,
    styles: product.styles,
    ingredients: product.ingredients,
    ...(product.colors?.length ? { colors: product.colors } : {}),
    ...(product.bundleIncludes?.length ? { bundleIncludes: product.bundleIncludes } : {}),
    ...(product.variants?.length
      ? { variants: product.variants.map((v) => ({ id: v.id, length: v.length, color: v.color, price: v.price, availability: v.soldOut ? "out_of_stock" : "in_stock" })) }
      : {}),
    ...(rating.count > 0 ? { rating: { average: Number(rating.average.toFixed(1)), count: rating.count } } : {}),
    image: product.images?.[0] ? `${SITE_URL}${product.images[0].src}` : null,
  };
}

// ---------------------------------------------------------------------------
// Recommendation routing
// ---------------------------------------------------------------------------

/** Every distinct concern in the catalog, with the products that address it. */
export const byConcern = () => {
  const map = new Map<string, Product[]>();
  for (const p of products) for (const c of p.concerns) map.set(c, [...(map.get(c) ?? []), p]);
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
};

/** Every distinct style in the catalog, with the products made for it. */
export const byStyle = () => {
  const map = new Map<string, Product[]>();
  for (const p of products) for (const s of p.styles) map.set(s, [...(map.get(s) ?? []), p]);
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
};

/** The six Wynn Method steps, each with the products that fill it. */
export const byRoutineStep = () =>
  method.map(([name, note], i) => ({
    step: i + 1,
    name,
    note,
    items: products.filter((p) => !p.kind && p.methodStep === i + 1),
  }));

// Who the brand is for, stated plainly so an assistant can decide whether a
// shopper is in the audience before it recommends anything. Sourced from the
// brand's own Organization description and the catalog's style coverage.
export const audience = {
  summary:
    "Wynn Essentials makes moisture, strength, scalp, and styling essentials for textured hair — curls, coils, braids, locs, twists, silk presses, wigs, weaves, and other protective styles.",
  shipsTo: "United States only",
  bestFor: [
    "People with textured hair building a repeatable wash-day and daily-care routine",
    "People wearing protective styles who need to reach the scalp and keep braids, locs, or twists moisturized",
    "People with dry, weak, or breaking hair looking for moisture and strength support",
    "People with itchy, flaky, or tight scalps",
    "People installing boho braids or knotless styles who need premium human hair bulk",
  ],
  notFor: [
    "Shoppers outside the United States — the store does not ship internationally",
    "Anyone who needs a return window on opened product; all sales are final apart from transit damage or an incorrect item",
  ],
  cautions:
    "Formulas use botanicals and essential oils. Patch test first, check the ingredient list on the product page, and stop use if irritation occurs. Nothing sold here treats or diagnoses a medical condition.",
};

// ---------------------------------------------------------------------------
// Markdown renderers
// ---------------------------------------------------------------------------

const money = (value: number | null) => (value == null ? "price to be confirmed" : `$${value.toFixed(2)}`);
const nameOf = (p: Product) => `${p.name} ${p.subtitle}`;
const linkTo = (p: Product) => `[${nameOf(p)}](${productUrl(p.slug)})`;

/**
 * /llms.txt — the index. Follows the llms.txt convention: an H1, a blockquote
 * summary, then link sections. Short on purpose; an agent reads this to decide
 * what to fetch next.
 */
export function renderLlmsTxt(): string {
  const sections: PageSection[] = ["Shop", "Find the right products", "Learn", "Policies and support"];
  const pages = allPages();
  const lines: string[] = [
    "# Wynn Essentials",
    "",
    `> ${audience.summary} Healthy hair is a practice.`,
    "",
    "Wynn Essentials LLC is a Black women-owned, family-run hair-care brand based in Los Angeles, California, founded by the Wynn Sisters. The storefront sells direct to consumers and ships within the United States only.",
    "",
    `- Full catalog and page detail in one file: [llms-full.txt](${SITE_URL}/llms-full.txt)`,
    `- Machine-readable catalog with live availability: [JSON catalog](${SITE_URL}/api/catalog)`,
    `- Every indexable URL: [sitemap.xml](${SITE_URL}/sitemap.xml)`,
    "",
  ];

  for (const section of sections) {
    const inSection = pages.filter((p) => p.section === section);
    if (!inSection.length) continue;
    lines.push(`## ${section}`, "");
    for (const page of inSection) lines.push(`- [${page.title}](${pageUrl(page.path)}): ${page.summary}`);
    lines.push("");
  }

  lines.push(
    "## Who these products are for",
    "",
    ...audience.bestFor.map((line) => `- ${line}`),
    "",
    "Not a fit:",
    "",
    ...audience.notFor.map((line) => `- ${line}`),
    "",
    `${audience.cautions}`,
    "",
    "## Contact",
    "",
    `- Email: ${social.email}`,
    `- Instagram: ${social.instagram}`,
    `- TikTok: ${social.tiktok}`,
    "",
  );

  return lines.join("\n");
}

/**
 * /llms-full.txt — the whole shoppable catalog in one fetch, plus the routing
 * an assistant needs to pick the right product for a given shopper. Written so
 * an agent that reads only this file can still answer accurately.
 */
export function renderLlmsFullTxt(soldOut: Set<string>): string {
  const lines: string[] = [
    "# Wynn Essentials — Full Catalog and Site Guide",
    "",
    `> ${audience.summary}`,
    "",
    `Canonical site: ${SITE_URL}. Prices are in USD and were generated from the live catalog. Availability below reflects live inventory at generation time; re-fetch ${SITE_URL}/api/catalog for the current state before telling a shopper an item is in stock.`,
    "",
    "## How to recommend these products",
    "",
    "Wynn Essentials organizes haircare as a six-step routine called The Wynn Method. A good recommendation starts from what the shopper is trying to solve (a concern), narrows by the style they wear, and then places the product in the routine so they know when to use it.",
    "",
  ];

  lines.push("### The Wynn Method", "");
  for (const step of byRoutineStep()) {
    const items = step.items.length ? step.items.map(linkTo).join(", ") : "—";
    lines.push(`${step.step}. **${step.name}** — ${step.note} → ${items}`);
  }
  lines.push("");

  lines.push("### By concern", "");
  for (const [concern, items] of byConcern()) lines.push(`- **${concern}**: ${items.map(linkTo).join(", ")}`);
  lines.push("");

  lines.push("### By style", "");
  for (const [style, items] of byStyle()) lines.push(`- **${style}**: ${items.map(linkTo).join(", ")}`);
  lines.push("");

  lines.push(
    "### Audience fit",
    "",
    "Good fit:",
    "",
    ...audience.bestFor.map((line) => `- ${line}`),
    "",
    "Poor fit:",
    "",
    ...audience.notFor.map((line) => `- ${line}`),
    "",
    audience.cautions,
    "",
    "## Products",
    "",
  );

  for (const p of products) {
    const isOut = soldOut.has(p.slug);
    lines.push(
      `### ${nameOf(p)}`,
      "",
      `- URL: ${productUrl(p.slug)}`,
      `- Price: ${money(p.price)}${p.size ? ` · ${p.size}` : ""}`,
      `- Availability: ${isOut ? "Sold out (waitlist available on the product page)" : "In stock"}`,
      `- Category: ${p.category}${p.methodStep ? ` · Wynn Method step ${p.methodStep} of 6 (${method[p.methodStep - 1][0]})` : ""}`,
      `- Best for: ${p.concerns.length ? p.concerns.join(", ") : "—"}`,
      `- Made for styles: ${p.styles.length ? p.styles.join(", ") : "—"}`,
      "",
      p.description,
      "",
      `**How to use:** ${p.directions}`,
      "",
    );
    if (p.bundleIncludes?.length) lines.push(`**Includes:** ${p.bundleIncludes.join(", ")}`, "");
    if (p.colors?.length) lines.push(`**Colors:** ${p.colors.join(", ")}`, "");
    if (p.variants?.length) {
      lines.push("**Options:**", "");
      for (const v of p.variants) lines.push(`- ${v.length}${v.color ? ` · ${v.color}` : ""} — ${money(v.price)}${v.soldOut ? " (sold out)" : ""}`);
      lines.push("");
    }
    if (p.ingredients.length) lines.push(`**Ingredients:** ${p.ingredients.join(", ")}`, "");

    const reviews = reviewsFor(p.slug).filter((r) => !r.galleryOnly);
    const rating = summarize(reviews);
    if (rating.count > 0) lines.push(`**Customer rating:** ${rating.average.toFixed(1)} out of 5 from ${rating.count} review${rating.count === 1 ? "" : "s"}.`, "");
  }

  lines.push(
    "## Ordering, shipping, and returns",
    "",
    "- Checkout is handled by Stripe and accepts major cards. No account is required; guest checkout sends confirmation and tracking to the email entered at checkout.",
    "- Shipping is within the United States only. Most orders take up to 3 business days to process; Boho Hair takes 3–7 business days. Carrier transit begins after processing.",
    "- U.S. orders over $50 qualify for free standard shipping. Standard and expedited rates are shown at checkout.",
    "- All sales are final. Returns and exchanges are limited to merchandise damaged in transit or an incorrect item sent by Wynn Essentials, reported within 5 calendar days of delivery, unused and in original packaging.",
    `- Customer service: ${social.email}`,
    "",
    "## Other pages",
    "",
    ...staticPages.map((page) => `- [${page.title}](${pageUrl(page.path)}): ${page.summary}`),
    "",
  );

  return lines.join("\n");
}
