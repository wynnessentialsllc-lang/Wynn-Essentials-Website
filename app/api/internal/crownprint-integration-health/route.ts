import { NextResponse } from "next/server";
import { crownprintConfig, hwlOrigin, secretFingerprint } from "../../../../lib/crownprint";
import { adminTokenConfigured } from "../../../../lib/admin-auth";

/**
 * GET /api/internal/crownprint-integration-health
 *
 * Answers one question without a deploy or a log dig: does this app hold the
 * same CrownPrint integration secret as the Hair Wellness Lab? Call it on both
 * sides and compare the fingerprints. Identical means the shared secret matches;
 * different means it does not, and no amount of protocol debugging will help
 * until it does.
 *
 * That comparison used to require a live connect attempt plus both Vercel log
 * streams. This is the same evidence, on demand.
 *
 * WHAT IT RETURNS
 *   integrationConfigured  boolean  — base URL + HMAC secret both present
 *   secretFingerprint      string   — SHA-256(secret), hex, first 12 chars
 *   allowedOriginConfigured boolean — the trusted HWL origin resolves
 *   audience               string   — the integration audience this app uses
 *   app / environment      string   — which deployment answered
 *
 * WHAT IT NEVER RETURNS
 * The secret, any HMAC key or signature, any connect code, any CrownPrint or
 * CrownState data, any user data, and no stack or config beyond the five fields
 * above.
 *
 * WHY IT IS GATED
 * The fingerprint is one-way and truncated, so it does not disclose the secret.
 * But an OPEN endpoint that returns it is an oracle: anyone holding a candidate
 * secret could confirm it instantly, and anyone could watch for rotations. It is
 * cheap to require the admin token, so it does — and when no admin token is
 * configured the route 404s rather than defaulting to open.
 *
 * TEMPORARY. This exists for integration bring-up and secret rotation. Delete
 * the directory when the integration is stable; nothing imports it.
 */
export const dynamic = "force-dynamic";

const AUDIENCE = "wynn-essentials";

function authorized(request: Request): boolean {
  const token = process.env.ADMIN_ORDERS_TOKEN;
  if (!token || token.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const query = new URL(request.url).searchParams.get("token") ?? "";
  const supplied = bearer || query;
  if (supplied.length !== token.length) return false;
  // Constant-time: a wrong guess must not be distinguishable by timing.
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) mismatch |= supplied.charCodeAt(i) ^ token.charCodeAt(i);
  return mismatch === 0;
}

export async function GET(request: Request) {
  // Indistinguishable from a route that does not exist, whether the token is
  // wrong or was never configured.
  if (!adminTokenConfigured() || !authorized(request)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const secret = crownprintConfig.hmacSecret;

  return NextResponse.json(
    {
      app: "wynn-essentials",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      integrationConfigured: Boolean(crownprintConfig.apiBaseUrl && secret),
      secretFingerprint: secret ? await secretFingerprint(secret) : null,
      allowedOriginConfigured: Boolean(hwlOrigin()),
      audience: AUDIENCE,
    },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}
