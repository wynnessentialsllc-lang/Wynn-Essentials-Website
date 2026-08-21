import type { MetadataRoute } from "next";
import { SITE_URL } from "./seo";

// Paths that are never content: /admin is token-gated server-side (disallowing
// it also keeps the URL out of search results so it is not discoverable in the
// first place), /shop-by-crownprint/connect is the CrownPrint handoff endpoint
// that only redirects and sets cookies, /order/* is a per-transaction receipt,
// and /unsubscribe acts on a token in the URL. The public /shop-by-crownprint
// landing stays crawlable.
const NEVER_CRAWL = ["/admin", "/shop-by-crownprint/connect", "/order/", "/unsubscribe"];

// AI assistants and shopping agents that identify themselves with their own
// user-agent. The wildcard rule below already permits them, but several of
// these crawlers treat "no rule addressed to me" as ambiguous and some
// publishers block them by default — naming each one is an unambiguous opt-in
// so Wynn Essentials can be found, cited, and recommended by name.
//
// Split by what each agent does, because the distinction matters:
//   - training/indexing crawlers build the model or the assistant's index
//   - live-fetch agents retrieve a page in response to a specific user question
const AI_AGENTS = [
  // OpenAI: search index, live user fetches, and the training crawler.
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  // Anthropic: search index, live user fetches, and the training crawler.
  "Claude-SearchBot",
  "Claude-User",
  "ClaudeBot",
  "anthropic-ai",
  // Google: Gemini and AI Overviews grounding (separate from Googlebot).
  "Google-Extended",
  "GoogleOther",
  // Perplexity: index crawler and live user fetches.
  "PerplexityBot",
  "Perplexity-User",
  // Microsoft Copilot / Bing generative answers.
  "Bingbot",
  // Apple Intelligence and Siri.
  "Applebot",
  "Applebot-Extended",
  // Amazon (Rufus / Alexa), Meta AI, DuckDuckGo's assistant, Mistral, Cohere,
  // You.com, and Common Crawl, which many smaller assistants build on.
  "Amazonbot",
  "meta-externalagent",
  "meta-externalfetcher",
  "DuckAssistBot",
  "MistralAI-User",
  "cohere-ai",
  "cohere-training-data-crawler",
  "YouBot",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: NEVER_CRAWL },
      // Same permissions, stated explicitly per agent so there is no ambiguity
      // about whether these crawlers may read and cite the storefront.
      ...AI_AGENTS.map((userAgent) => ({ userAgent, allow: "/", disallow: NEVER_CRAWL })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
