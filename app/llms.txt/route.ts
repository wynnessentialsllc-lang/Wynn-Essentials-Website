import { renderLlmsTxt } from "../../lib/agent-catalog";

// /llms.txt — the llms.txt convention: a short, curated map of the site written
// for an AI assistant rather than a browser. An agent fetches this first to
// learn what Wynn Essentials sells, who it is for, and which URLs are worth
// reading, then follows the links it needs.
//
// Served as text/plain so it renders in any client, cached at the edge because
// the content only changes when the catalog or the page inventory does.
export const dynamic = "force-static";
export const revalidate = 3600;

export function GET() {
  return new Response(renderLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "all",
    },
  });
}
