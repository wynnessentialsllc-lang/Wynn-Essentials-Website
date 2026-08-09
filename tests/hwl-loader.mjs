// Module resolution hook that lets the tests import lib/crownprint.ts directly,
// unmodified, so the origin-validation assertions exercise the shipped source
// rather than a copy of it.
//
// Two things are needed: next/headers has no plain-Node entry point (the cookie
// jar is irrelevant to URL composition, so it is stubbed), and TypeScript's
// extensionless relative imports need the ".ts" restored.
import { existsSync } from "node:fs";

const STUB = new URL("./next-headers-stub.mjs", import.meta.url).href;
const SERVER_STUB = new URL("./next-server-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers") return { url: STUB, shortCircuit: true };
  if (specifier === "next/server") return { url: SERVER_STUB, shortCircuit: true };
  if (specifier.startsWith(".") && !/\.[mc]?[jt]s(\?|$)/.test(specifier) && context.parentURL) {
    const [path, query] = specifier.split("?");
    const candidate = new URL(`${path}.ts`, context.parentURL);
    if (existsSync(decodeURIComponent(candidate.pathname))) {
      return { url: `${candidate.href}${query ? `?${query}` : ""}`, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
