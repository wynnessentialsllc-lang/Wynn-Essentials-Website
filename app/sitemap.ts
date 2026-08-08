import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { products } from "./data";
import { SITE_URL } from "./seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Published blog posts, best-effort: if the DB or table is unavailable the
  // sitemap still returns the static routes rather than failing.
  let blog: MetadataRoute.Sitemap = [];
  try {
    const { getDb } = await import("../db");
    const { blogPosts } = await import("../db/schema");
    const rows = await getDb().select({ slug: blogPosts.slug, updatedAt: blogPosts.updatedAt }).from(blogPosts).where(eq(blogPosts.status, "published"));
    blog = rows.map((r) => ({ url: `${SITE_URL}/blog/${r.slug}`, priority: 0.6, changeFrequency: "monthly" as const, ...(r.updatedAt ? { lastModified: r.updatedAt } : {}) }));
  } catch { blog = []; }

  return [
    { url: SITE_URL, priority: 1, changeFrequency: "weekly" },
    { url: `${SITE_URL}/braiding-hair`, priority: 0.8, changeFrequency: "weekly" },
    // The public Shop by CrownPrint landing is indexable educational content.
    // Personalized results share this one URL and are marked noindex per-request,
    // so no per-result URLs are ever emitted here.
    { url: `${SITE_URL}/shop-by-crownprint`, priority: 0.8, changeFrequency: "weekly" },
    // The CrownPrint-code page. Its bare form is educational (what the five axes
    // mean); personalized results live on the same URL behind a query string and
    // are marked noindex per-request, so nothing per-shopper is ever listed here.
    { url: `${SITE_URL}/crownprint`, priority: 0.8, changeFrequency: "weekly" },
    { url: `${SITE_URL}/blog`, priority: 0.7, changeFrequency: "weekly" },
    // Each product now has its own crawlable, indexable page. Search engines and
    // AI assistants discard the old "/#product-slug" fragments, so the real
    // "/products/slug" URLs are what belong in the sitemap.
    ...products.map((p) => ({
      url: `${SITE_URL}/products/${p.slug}`,
      priority: 0.8,
      changeFrequency: "weekly" as const,
    })),
    ...blog,
  ];
}
