# AI agent discovery

How ChatGPT, Claude, Perplexity, Gemini, Copilot, and other AI assistants find
Wynn Essentials pages and recommend the right product to the right shopper.

An assistant does not browse the storefront the way a person does. It fetches a
handful of machine-readable entry points, decides what is relevant, and then
pulls only the pages those entry points point at. If a page is not named in one
of those entry points, an assistant will usually never see it — and will never
recommend it.

## The four surfaces

| Surface | Route | What it is for |
| --- | --- | --- |
| `robots.txt` | `app/robots.ts` | Permission. Names each AI crawler explicitly so none of them treats "no rule addressed to me" as a reason to skip the site. |
| `sitemap.xml` | `app/sitemap.ts` | Enumeration. Every indexable URL, including every product page, every policy page, and every published blog post. |
| `llms.txt` | `app/llms.txt/route.ts` | Orientation. A short plain-text map: what the brand sells, who it is for, and which URL answers which question. |
| `llms-full.txt` | `app/llms-full.txt/route.ts` | Depth. The whole catalog in one fetch — price, size, ingredients, directions, concerns, styles, availability — so an assistant that makes a single request still answers accurately. |
| `/api/catalog` | `app/api/catalog/route.ts` | Integration. The same content as JSON, with live availability, for shopping agents and partners that would otherwise scrape. |

Product pages additionally carry schema.org `Product` data with the offer's
shipping terms, return policy, audience, and links to related products. That is
what powers price and rating rich results and what lets an assistant compare
items without reading prose.

## One source of truth

`lib/agent-catalog.ts` holds the page inventory and every renderer. The sitemap,
`/llms.txt`, `/llms-full.txt`, and `/api/catalog` all read from it, so a page
cannot appear in one and be missing from another.

**Adding a public page?** Add it to `staticPages` in `lib/agent-catalog.ts` with
a title and a one-line summary. That is the only step —
`tests/agent-discovery.test.mjs` walks `app/` and fails the build if a page
renders but is not listed, so the omission cannot ship quietly.

Product pages and blog posts are generated, not listed by hand: products come
from `app/data.ts` and blog posts from the database.

## What is deliberately not discoverable

`/admin`, `/shop-by-crownprint/connect`, `/order/*`, and `/unsubscribe` are
excluded from the inventory and disallowed in `robots.txt`. They are token-gated,
per-transaction, or redirect-only — never content. Personalized CrownPrint
results share the public `/crownprint` and `/shop-by-crownprint` URLs and are
marked `noindex` per request, so no per-shopper URL is ever published.

## Keeping recommendations honest

Everything an assistant reads is derived from `app/data.ts`, `app/reviews.ts`,
and the published policy pages — never written twice. A product's description
and directions are quoted verbatim, availability is merged from the same live
inventory table the storefront reads, and the audience notes say plainly who the
products are *not* for (shoppers outside the U.S., anyone expecting a return
window on opened product). The test suite asserts the verbatim quoting, the
"patch test first" safety note, and the absence of medical or guaranteed-outcome
claims.

If the shipping or return policy changes, update `app/shipping/page.tsx` or
`app/returns/page.tsx` **and** the matching constants in `app/seo.ts` and
`lib/agent-catalog.ts`.

## Checking it works

```bash
npm run build          # all four routes must appear in the route table
curl localhost:3000/robots.txt
curl localhost:3000/sitemap.xml
curl localhost:3000/llms.txt
curl localhost:3000/api/catalog
```

Once deployed, submit the sitemap in Google Search Console and Bing Webmaster
Tools. Bing's index is what Copilot and several other assistants read from, so
it is worth registering both.
