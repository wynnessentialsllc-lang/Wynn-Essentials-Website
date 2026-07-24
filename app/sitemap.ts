import type { MetadataRoute } from "next";
import { products } from "./data";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://www.wynnessentialsllc.us";
  return [{ url: base, priority: 1, changeFrequency: "weekly" }, ...products.map(p => ({ url: `${base}/#product-${p.slug}`, priority: .8, changeFrequency: "weekly" as const }))];
}
