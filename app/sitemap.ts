import type { MetadataRoute } from "next";
import { products } from "./data";
import { SITE_URL } from "./seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, priority: 1, changeFrequency: "weekly" },
    { url: `${SITE_URL}/braiding-hair`, priority: 0.8, changeFrequency: "weekly" },
    // Each product now has its own crawlable, indexable page. Search engines and
    // AI assistants discard the old "/#product-slug" fragments, so the real
    // "/products/slug" URLs are what belong in the sitemap.
    ...products.map((p) => ({
      url: `${SITE_URL}/products/${p.slug}`,
      priority: 0.8,
      changeFrequency: "weekly" as const,
    })),
  ];
}
