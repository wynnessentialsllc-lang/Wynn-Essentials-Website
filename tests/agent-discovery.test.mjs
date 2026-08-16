// AI assistants find this store through four surfaces: robots.txt, the sitemap,
// /llms.txt, and /api/catalog. The failure that matters is silent — someone adds
// a page and it simply never appears in any of them, so no assistant can find it
// and no shopper is ever pointed at it.
//
// This suite makes that failure loud. It walks the real app/ directory, derives
// every public route, and asserts each one is discoverable and internally
// consistent with the catalog it claims to describe.

import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const { products } = await import("../app/data.ts");
const { staticPages, productPages, allPages, pageUrl, renderLlmsTxt, renderLlmsFullTxt, audience } = await import("../lib/agent-catalog.ts");

const read = (rel) => readFile(new URL(rel, import.meta.url), "utf8");

// Routes that are deliberately not content: token-gated admin, the CrownPrint
// handoff redirect, per-transaction receipts, and the tokenized unsubscribe
// action. These must stay OUT of the inventory and IN the robots disallow list.
const NON_CONTENT = [/^\/admin/, /^\/order\//, /^\/unsubscribe$/, /^\/shop-by-crownprint\/connect$/];

/** Every route under app/ that renders a page, as a site-relative path. */
async function routesOnDisk(dir = new URL("../app/", import.meta.url), prefix = "") {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // Route groups "(x)" and private folders "_x" do not add a path segment.
      const segment = entry.name.startsWith("(") || entry.name.startsWith("_") ? "" : `/${entry.name}`;
      found.push(...(await routesOnDisk(new URL(`${entry.name}/`, dir), `${prefix}${segment}`)));
    } else if (entry.name === "page.tsx") {
      found.push(prefix === "" ? "/" : prefix);
    }
  }
  return found;
}

test("every public page on disk is in the agent-facing page inventory", async () => {
  const routes = await routesOnDisk();
  const known = new Set(allPages().map((p) => p.path));

  for (const route of routes) {
    if (NON_CONTENT.some((pattern) => pattern.test(route))) continue;
    // Dynamic segments are covered by generated entries, not by hand: product
    // pages come from the catalog and blog posts from the database.
    if (route === "/products/[slug]") {
      assert.equal(productPages().length, products.length, "one page entry per catalog product");
      continue;
    }
    if (route === "/blog/[slug]") continue; // enumerated from the DB in sitemap.ts

    assert.ok(
      known.has(route),
      `${route} renders a page but is missing from staticPages in lib/agent-catalog.ts, so it is absent from the sitemap, /llms.txt, and /api/catalog`,
    );
  }
});

test("the inventory lists no page that does not exist, and no non-content route", async () => {
  const routes = new Set(await routesOnDisk());
  for (const page of staticPages) {
    assert.ok(routes.has(page.path), `${page.path} is listed for agents but no page.tsx renders it`);
    assert.ok(!NON_CONTENT.some((pattern) => pattern.test(page.path)), `${page.path} is not content and must not be advertised to agents`);
  }
  // Entries must be usable: an agent shows the title and decides from the summary.
  for (const page of allPages()) {
    assert.ok(page.title.length > 0, `${page.path} needs a title`);
    assert.ok(page.summary.length > 20, `${page.path} needs a summary an agent can act on`);
  }
});

test("robots.txt permits the named AI assistants and still blocks non-content routes", async () => {
  const robots = await read("../app/robots.ts");
  // The assistants that actually drive recommendations today. Each must be
  // addressed by name so "no rule for me" is never the reason we go uncited.
  for (const agent of ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "PerplexityBot", "Google-Extended", "Applebot-Extended", "Amazonbot"]) {
    assert.ok(robots.includes(`"${agent}"`), `robots.ts must name ${agent} so its access is unambiguous`);
  }
  assert.match(robots, /allow: "\/"/, "AI agents must be allowed to crawl the storefront");
  for (const blocked of ["/admin", "/shop-by-crownprint/connect", "/order/", "/unsubscribe"]) {
    assert.ok(robots.includes(`"${blocked}"`), `${blocked} must stay disallowed`);
  }
});

test("/llms.txt indexes every page and states who the products are for", () => {
  const txt = renderLlmsTxt();
  assert.match(txt, /^# Wynn Essentials/, "llms.txt starts with the H1 the convention expects");
  assert.match(txt, /^> /m, "llms.txt needs the blockquote summary");

  for (const page of allPages()) {
    assert.ok(txt.includes(pageUrl(page.path)), `/llms.txt must link ${page.path}`);
  }
  // The audience block is the point: an assistant should be able to tell
  // whether a shopper is a fit before it recommends anything.
  for (const line of [...audience.bestFor, ...audience.notFor]) assert.ok(txt.includes(line));
  assert.ok(txt.includes("/llms-full.txt") && txt.includes("/api/catalog") && txt.includes("/sitemap.xml"));
});

test("/llms-full.txt carries every product with the facts needed to recommend it", () => {
  const txt = renderLlmsFullTxt(new Set(["nourish-oil"]));

  for (const p of products) {
    assert.ok(txt.includes(`### ${p.name} ${p.subtitle}`), `${p.slug} must have its own section`);
    assert.ok(txt.includes(`https://wynnessentialsllc.us/products/${p.slug}`), `${p.slug} must link its product page`);
    if (p.price != null) assert.ok(txt.includes(`$${p.price.toFixed(2)}`), `${p.slug} must state its price`);
    // The catalog's own words, never a second paraphrase that can drift.
    assert.ok(txt.includes(p.description), `${p.slug} must use the catalog description verbatim`);
    assert.ok(txt.includes(p.directions), `${p.slug} must use the catalog directions verbatim`);
  }

  // Availability is reported, not assumed: the one product passed as sold out
  // reads as sold out, and a product not in that set does not.
  const nourish = txt.slice(txt.indexOf("### Nourish"));
  assert.match(nourish.slice(0, 600), /Availability: Sold out/);
  assert.ok(txt.includes("- Availability: In stock"), "in-stock products must say so");

  // The routing an assistant needs: concern, style, and routine placement.
  assert.ok(txt.includes("### By concern") && txt.includes("### By style") && txt.includes("### The Wynn Method"));
  for (const concern of new Set(products.flatMap((p) => p.concerns))) {
    assert.ok(txt.includes(`**${concern}**`), `${concern} must be a routable concern`);
  }
  // United States only — an assistant must never recommend the store to someone
  // it cannot ship to.
  assert.ok(txt.includes("United States"));
});

test("agent-facing copy claims nothing the catalog does not say", () => {
  const txt = renderLlmsFullTxt(new Set());
  // No medical or guaranteed-outcome language may enter through this surface.
  for (const forbidden of [/\bcures?\b/i, /\bguaranteed?\b/i, /\btreats? (?:a )?(?:medical|condition|disease)/i, /\bclinically proven\b/i]) {
    const match = txt.match(forbidden);
    // "does not treat or diagnose" is the disclaimer, not a claim.
    if (match) assert.ok(/treat or diagnose/.test(txt.slice(Math.max(0, match.index - 60), match.index + 60)), `agent copy must not claim: ${match[0]}`);
  }
  assert.ok(txt.includes("Patch test first"), "the safety note must survive into the agent-facing copy");
});
