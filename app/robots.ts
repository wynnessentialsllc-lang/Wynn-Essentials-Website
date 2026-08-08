import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  // /admin is token-gated server-side; disallowing it also keeps the URL out of
  // search results so it is not discoverable in the first place.
  // /admin is token-gated. /shop-by-crownprint/start (outbound hop to Hair
  // Wellness Lab) and /shop-by-crownprint/connect (the HWL callback that
  // redeems the one-time code) are handoff endpoints — redirects only, never
  // content — so keep both out of search. The public /shop-by-crownprint
  // landing stays crawlable.
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/shop-by-crownprint/start", "/shop-by-crownprint/connect"],
    },
    sitemap: "https://wynnessentialsllc.us/sitemap.xml",
  };
}
