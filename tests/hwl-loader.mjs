// Module resolution hook that lets the tests import lib/crownprint.ts directly,
// unmodified, so the origin-validation assertions exercise the shipped source
// rather than a copy of it.
//
// Two things are needed: next/headers has no plain-Node entry point (the cookie
// jar is irrelevant to URL composition, so it is stubbed), and TypeScript's
// extensionless relative imports need the ".ts" restored.
// A third is needed to run the connect callback end to end: the CrownPrint
// session store reaches for Postgres, which does not exist in a test process.
// That substitution is scoped to lib/crownprint.ts's own dynamic import — every
// other module that imports the database still gets the real one.
import { existsSync } from "node:fs";

const STUB = new URL("./next-headers-stub.mjs", import.meta.url).href;
const SERVER_STUB = new URL("./next-server-stub.mjs", import.meta.url).href;
const SESSION_STORE_STUB = new URL("./crownprint-session-store-stub.mjs", import.meta.url).href;
const SESSION_STORE_IMPORTER = /\/lib\/crownprint\.ts$/;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers") return { url: STUB, shortCircuit: true };
  if (specifier === "next/server") return { url: SERVER_STUB, shortCircuit: true };
  if (
    (specifier === "../db" || specifier === "../db/schema") &&
    SESSION_STORE_IMPORTER.test(context.parentURL ?? "")
  ) {
    return { url: SESSION_STORE_STUB, shortCircuit: true };
  }
  if (specifier.startsWith(".") && !/\.[mc]?[jt]s(\?|$)/.test(specifier) && context.parentURL) {
    const [path, query] = specifier.split("?");
    const candidate = new URL(`${path}.ts`, context.parentURL);
    if (existsSync(decodeURIComponent(candidate.pathname))) {
      return { url: `${candidate.href}${query ? `?${query}` : ""}`, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
