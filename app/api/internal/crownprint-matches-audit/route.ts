import { NextResponse } from "next/server";
import { products } from "../../../data";
import { readMatchSession } from "../../../../lib/crownprint";
import { enforceMatchesOnly, selectGuidance } from "../../../../lib/crownprint-guidance";
import { adminTokenConfigured } from "../../../../lib/admin-auth";

/**
 * GET /api/internal/crownprint-matches-audit
 *
 * THE LIVE ACCEPTANCE TEST for the HWL contract hardening.
 *
 * Answers one question against real production data, for a real connected
 * shopper session:
 *
 *     Is the set of rendered CrownPrint product keys a subset of the Hair
 *     Wellness Lab's canonical matches array?
 *
 * It does this by running the EXACT pipeline /shop-by-crownprint runs — the same
 * readMatchSession(), the same selectGuidance(), the same enforceMatchesOnly() —
 * and reporting both sets plus the verdict. It is an observation of the real
 * path, not a re-implementation that could drift from it.
 *
 * HOW TO RUN IT
 * From a browser already connected to a CrownPrint (the audit reads the same
 * httpOnly session cookie the page does):
 *
 *     /api/internal/crownprint-matches-audit?token=<ADMIN_ORDERS_TOKEN>
 *
 * A `subset: true` with a non-empty renderedKeys is the proof. `subset: false`
 * means something upstream is manufacturing product cards again, and
 * `violations` names them.
 *
 * WHAT IT RETURNS
 *   connected      boolean   — whether a trusted CrownPrint session was present
 *   authorizedKeys string[]  — HWL's matches[].productKey, verbatim
 *   renderedKeys   string[]  — the same keys, for those the page actually renders
 *   renderedCatalogSlugs string[] — the Wynn slug each rendered key resolved to
 *   unresolvedKeys string[]  — authorized by HWL but NOT rendered. Non-empty
 *                              means a valid CrownPrint is losing products —
 *                              `subset` stays true, so this is the field that
 *                              catches it
 *   accessoryKeys  string[]  — the separate accessory channel, reported apart
 *   coverageKeys   string[]  — coverage functionKeys, to show they name no product
 *   subset         boolean   — renderedKeys ⊆ authorizedKeys
 *   violations     string[]  — rendered keys with no HWL verdict (always [] when healthy)
 *
 * WHAT IT NEVER RETURNS
 * No CrownPrint answers, no CrownState detail, no scores, weights, thresholds or
 * reason codes, no report content, no user identity, and no secret. Product keys
 * and coverage function keys only — the former are already visible on the page,
 * and the latter cannot name a product by construction.
 *
 * WHY IT IS GATED
 * It reports on a specific shopper's session. That is not sensitive in the way a
 * secret is, but it is theirs, so the admin token is required and the route 404s
 * when no token is configured rather than defaulting to open.
 */
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const token = process.env.ADMIN_ORDERS_TOKEN;
  if (!token || token.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const query = new URL(request.url).searchParams.get("token") ?? "";
  const supplied = bearer || query;
  if (supplied.length !== token.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) mismatch |= supplied.charCodeAt(i) ^ token.charCodeAt(i);
  return mismatch === 0;
}

export async function GET(request: Request) {
  if (!adminTokenConfigured() || !authorized(request)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const context = await readMatchSession();

  // Exactly what app/shop-by-crownprint/page.tsx does, in the same order.
  const guidance = selectGuidance({ context, catalog: products });
  const rendered = enforceMatchesOnly(guidance.matches, context ? context.matches : null)
    // The page then drops anything missing from the live catalog; mirror that so
    // renderedKeys is what a shopper actually sees, not what survived the guard.
    // Joined on catalogSlug, exactly as the page joins it.
    .filter((m) => products.some((p) => p.slug === m.catalogSlug));

  // Both sides in HWL's vocabulary, so the subset check is like-for-like. The
  // Wynn slug each one renders as is reported separately rather than swapped in,
  // because a key that silently changed shape is the bug this audit found.
  const authorizedKeys = (context?.matches ?? []).map((m) => m.productKey);
  const renderedKeys = rendered.map((m) => m.productKey);
  const renderedCatalogSlugs = rendered.map((m) => m.catalogSlug);
  // Authorized by HWL but not renderable: the failure mode that produced an
  // empty results page for a shopper whose CrownPrint was perfectly valid.
  const unresolvedKeys = authorizedKeys.filter((k) => !renderedKeys.includes(k));
  const allowed = new Set(authorizedKeys);
  const violations = renderedKeys.filter((k) => !allowed.has(k));

  return NextResponse.json(
    {
      app: "wynn-essentials",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      connected: context !== null && context.crownPrintPresent === true,
      authorizedKeys,
      renderedKeys,
      renderedCatalogSlugs,
      unresolvedKeys,
      accessoryKeys: guidance.accessories.map((a) => a.productKey),
      coverageKeys: guidance.coverage.map((c) => c.functionKey),
      // The assertion itself. An unconnected session renders nothing, so the
      // empty set is trivially a subset — `connected` is what says whether this
      // run actually exercised anything.
      subset: violations.length === 0,
      violations,
    },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}
