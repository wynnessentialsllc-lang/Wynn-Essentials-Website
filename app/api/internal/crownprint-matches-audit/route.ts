import { NextResponse } from "next/server";
import { products } from "../../../data";
import { readMatchSession } from "../../../../lib/crownprint";
import { enforceMatchesOnly, selectGuidance } from "../../../../lib/crownprint-guidance";
import { HWL_CANONICAL_PRODUCT_KEYS, resolveCatalogSlug } from "../../../../lib/crownprint-catalog-key";
import { hasCapabilityLabel } from "../../../../lib/crownprint-capability-labels";
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
 *   contract642    object    — whether the explanation fields actually arrived,
 *                              per rendered match, plus the raw functionKey /
 *                              capabilityKey and any capability with no curated
 *                              Wynn label yet. `complete: true` means every
 *                              rendered match carried the full explanation.
 *   bridge         object    — the HWL→Wynn identity bridge for ALL eleven
 *                              canonical keys, resolved against this
 *                              deployment's catalog. Needs no CrownPrint, so
 *                              edgeControl and softLifeBonnet can be smoke
 *                              tested without waiting for a shopper whose
 *                              matches happen to include them. `complete: true`
 *                              with `unresolved: []` is the pass.
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

  // THE BRIDGE SMOKE TEST.
  //
  // Resolves HWL's whole frozen vocabulary against the catalog THIS deployment
  // actually shipped. It needs no CrownPrint and no session, which is the point:
  // a shopper whose matches resolve to the bonnet or Edge Control may not come
  // along for weeks, and waiting for one is how eight broken keys went unnoticed
  // behind a `revaivl` case that happened to work.
  //
  // Read-only and authorization-free by construction: resolving a key says
  // nothing about whether it may render. Only `matches` decides that.
  const bridge = HWL_CANONICAL_PRODUCT_KEYS.map((key) => {
    const catalogSlug = resolveCatalogSlug(key, products);
    return {
      key,
      catalogSlug,
      inCatalog: Boolean(catalogSlug && products.some((p) => p.slug === catalogSlug)),
    };
  });
  const bridgeUnresolved = bridge.filter((b) => !b.inCatalog).map((b) => b.key);

  // CONTRACT #642 PRESENCE.
  //
  // Answers "has the explanation contract actually landed in production?"
  // against the real payload, in one request. Without this the only way to know
  // is to look at a card and notice a missing line, which is exactly how a
  // half-shipped contract stays unnoticed.
  //
  // Booleans and identifiers only — the field VALUES are consumer-safe copy
  // already visible on the page, so nothing new is disclosed by reporting
  // whether they arrived.
  const explanation = rendered.map((m) => ({
    productKey: m.productKey,
    needServed: Boolean(m.needServed),
    functionServed: Boolean(m.functionServed),
    functionKey: m.functionKey ?? null,
    capabilityKey: m.evidence?.capabilityKey ?? null,
    ingredient: Boolean(m.evidence?.ingredient),
    statement: Boolean(m.evidence?.statement),
    limitation: Boolean(m.limitation),
  }));
  const complete = explanation.length > 0 && explanation.every(
    (e) => e.needServed && e.functionServed && e.capabilityKey && e.ingredient && e.limitation,
  );
  // Capability keys arriving with no curated Wynn label. These still render
  // readably, but mechanically — this is the list to turn into real copy.
  const unlabeledCapabilities = [
    ...new Set(
      rendered
        .map((m) => m.evidence?.capabilityKey)
        .filter((k): k is string => Boolean(k) && !hasCapabilityLabel(k)),
    ),
  ];

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
      // Has HWL contract #642 actually landed here? Booleans plus the canonical
      // machine identifiers, which live here rather than in the markup —
      // customers see readable labels, audits see the keys.
      contract642: { complete, unlabeledCapabilities, perMatch: explanation },
      coverageKeys: guidance.coverage.map((c) => c.functionKey),
      // The assertion itself. An unconnected session renders nothing, so the
      // empty set is trivially a subset — `connected` is what says whether this
      // run actually exercised anything.
      subset: violations.length === 0,
      violations,
      // Independent of the session above: proves the HWL→Wynn identity bridge
      // against this deployment's own catalog, for all eleven canonical keys.
      bridge: {
        canonicalKeys: bridge.length,
        resolved: bridge.length - bridgeUnresolved.length,
        unresolved: bridgeUnresolved,
        complete: bridgeUnresolved.length === 0,
        table: bridge,
      },
    },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}
