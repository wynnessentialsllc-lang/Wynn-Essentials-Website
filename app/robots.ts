import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  // /admin is token-gated server-side; disallowing it also keeps the URL out of
  // search results so it is not discoverable in the first place.
  // /admin is token-gated. /shop-by-crownprint/connect is the CrownPrint handoff
  // endpoint (redirects only, sets cookies) — never content, so keep it out of
  // search. The public /shop-by-crownprint landing stays crawlable.
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/shop-by-crownprint/connect"] }, sitemap: "https://wynnessentialsllc.us/sitemap.xml" };
}
