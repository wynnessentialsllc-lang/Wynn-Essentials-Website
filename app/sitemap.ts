import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { SITE_URL } from "./seo";
import { allPages, pageUrl } from "../lib/agent-catalog";

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

  // Every indexable page — the storefront, the CrownPrint pages, the editorial
  // hub, the About page, one crawlable URL per catalog product, and the policy
  // and support pages — comes from lib/agent-catalog's page inventory, the same
  // list /llms.txt publishes. One list means a new page can never appear in one
  // and be missing from the other.
  //
  // Notes on what that list deliberately includes and excludes:
  //   - /shop-by-crownprint and /crownprint are listed once each. Personalized
  //     results share those URLs behind a query string and are marked noindex
  //     per-request, so no per-shopper URL is ever emitted here.
  //   - Each product has its own crawlable page. Search engines and AI
  //     assistants discard the old "/#product-slug" fragments, so the real
  //     "/products/slug" URLs are what belong here.
  //   - /admin, the CrownPrint connect handoff, order receipts, and unsubscribe
  //     are not content and are excluded from the inventory and from robots.
  return [
    ...allPages().map((page) => ({
      url: pageUrl(page.path),
      priority: page.priority,
      changeFrequency: page.changeFrequency,
    })),
    ...blog,
  ];
}
