import { NextResponse } from "next/server";
import {
  allPages,
  audience,
  byConcern,
  byRoutineStep,
  byStyle,
  liveSoldOut,
  pageUrl,
  productRecord,
} from "../../../lib/agent-catalog";
import { products, method } from "../../data";
import { SITE_URL, faqs, social } from "../../seo";

// Public, machine-readable catalog for AI shopping agents and any integration
// that would otherwise have to scrape the storefront. Structured data on the
// product pages covers crawlers that render HTML; this covers agents that just
// want the facts in one request, with live availability merged in.
//
// Read-only, no personal data, no secrets: it exposes exactly what the public
// product pages already show.
export const dynamic = "force-dynamic";

export async function GET() {
  const soldOut = await liveSoldOut();

  return NextResponse.json(
    {
      brand: {
        name: "Wynn Essentials",
        legalName: "Wynn Essentials LLC",
        url: SITE_URL,
        tagline: "Healthy hair is a practice.",
        description: audience.summary,
        founders: ["Patricia Wynn", "Karina Wynn", "Sheree Wynn"],
        location: "Los Angeles, CA, US",
        email: social.email,
        instagram: social.instagram,
        tiktok: social.tiktok,
      },
      // Who to recommend these products to, and who not to. An agent that reads
      // only this block should still route a shopper correctly.
      audience,
      // The six-step routine the catalog is organized around, plus the two
      // lookups an assistant needs to answer "what should I use for X".
      routine: {
        name: "The Wynn Method",
        steps: method.map(([name, note], i) => ({ step: i + 1, name, note })),
        productsByStep: byRoutineStep().map((s) => ({ step: s.step, name: s.name, slugs: s.items.map((p) => p.slug) })),
      },
      productsByConcern: Object.fromEntries(byConcern().map(([concern, items]) => [concern, items.map((p) => p.slug)])),
      productsByStyle: Object.fromEntries(byStyle().map(([style, items]) => [style, items.map((p) => p.slug)])),
      products: products.map((p) => productRecord(p, soldOut.has(p.slug))),
      // Everything an agent needs to quote ordering terms without guessing.
      policies: {
        shipsTo: ["US"],
        freeShippingThresholdUsd: 50,
        processingBusinessDays: "Up to 3 business days; Boho Hair orders take 3–7 business days.",
        returns: "All sales are final. Returns and exchanges are limited to merchandise damaged in transit or an incorrect item sent by Wynn Essentials, reported within 5 calendar days of delivery, unused and in original packaging.",
        payment: "Stripe checkout, major cards accepted. Guest checkout available; no account required.",
        urls: {
          shipping: `${SITE_URL}/shipping`,
          returns: `${SITE_URL}/returns`,
          refunds: `${SITE_URL}/refunds`,
          privacy: `${SITE_URL}/privacy`,
          terms: `${SITE_URL}/terms`,
        },
      },
      faqs,
      // The same page inventory the sitemap and /llms.txt publish, so an agent
      // can enumerate the site without parsing XML.
      pages: allPages().map((p) => ({ url: pageUrl(p.path), title: p.title, summary: p.summary, section: p.section })),
      documents: {
        llms: `${SITE_URL}/llms.txt`,
        llmsFull: `${SITE_URL}/llms-full.txt`,
        sitemap: `${SITE_URL}/sitemap.xml`,
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        // Cross-origin readable: an assistant running in a browser context
        // should be able to fetch the public catalog.
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
