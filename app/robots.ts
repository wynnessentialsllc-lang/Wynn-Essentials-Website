import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  // /admin is token-gated server-side; disallowing it also keeps the URL out of
  // search results so it is not discoverable in the first place.
  return { rules: { userAgent: "*", allow: "/", disallow: "/admin" }, sitemap: "https://www.wynnessentialsllc.us/sitemap.xml" };
}
