import { liveSoldOut, renderLlmsFullTxt } from "../../lib/agent-catalog";

// /llms-full.txt — the whole shoppable catalog and the recommendation routing
// in a single fetch, so an assistant that will only make one request still has
// accurate prices, sizes, ingredients, directions, concerns, styles, and
// availability rather than guessing from a product page it happened to land on.
//
// Dynamic because availability is merged from live inventory; the short cache
// keeps it cheap without letting a sold-out item read as in stock for long.
export const dynamic = "force-dynamic";

export async function GET() {
  const soldOut = await liveSoldOut();
  return new Response(renderLlmsFullTxt(soldOut), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Robots-Tag": "all",
    },
  });
}
