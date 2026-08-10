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
const LINK_STUB = new URL("./next-link-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers") return { url: STUB, shortCircuit: true };
  if (specifier === "next/server") return { url: SERVER_STUB, shortCircuit: true };
  if (
    (specifier === "../db" || specifier === "../db/schema") &&
    SESSION_STORE_IMPORTER.test(context.parentURL ?? "")
  ) {
    return { url: SESSION_STORE_STUB, shortCircuit: true };
  }
  // next/link and next/image resolve to React internals that need a bundler.
  // The comprehension tests render real components, and a link is a link.
  if (specifier === "next/link") return { url: LINK_STUB, shortCircuit: true };
  if (specifier.startsWith(".") && !/\.[mc]?[jt]sx?(\?|$)/.test(specifier) && context.parentURL) {
    const [path, query] = specifier.split("?");
    // .tsx as well as .ts: a component importing a sibling component is the
    // common case once the tests render real pages.
    for (const ext of [".ts", ".tsx"]) {
      const candidate = new URL(`${path}${ext}`, context.parentURL);
      if (existsSync(decodeURIComponent(candidate.pathname))) {
        return { url: `${candidate.href}${query ? `?${query}` : ""}`, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}

/**
 * Node's --experimental-strip-types handles .ts but not .tsx: JSX needs a
 * transform, not just type erasure. esbuild (already a build dependency) does
 * that transform, which lets the comprehension tests render the REAL page
 * components and assert on the HTML a shopper actually receives — rather than
 * on a copy of the markup that could drift from the component.
 */
export async function load(url, context, nextLoad) {
  if (url.endsWith(".tsx")) {
    const { readFile } = await import("node:fs/promises");
    const { transform } = await import("esbuild");
    const source = await readFile(new URL(url), "utf8");
    const { code } = await transform(source, {
      loader: "tsx",
      format: "esm",
      target: "node22",
      jsx: "automatic",
    });
    return { format: "module", source: code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
