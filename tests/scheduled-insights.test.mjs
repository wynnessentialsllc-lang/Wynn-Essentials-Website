import assert from "node:assert/strict";
import test from "node:test";

import { scheduledInsights, liveScheduledInsights } from "../lib/scheduled-insights.ts";

const excluded = new Set(["labor-day-2026-final-hours", "cyber-2026", "final-2026", "shipping-2026"]);

test("every eligible email campaign has one scheduled Insight", () => {
  assert.equal(scheduledInsights.length, 37);
  assert.equal(new Set(scheduledInsights.map(post => post.campaignId)).size, 37);
  assert.equal(new Set(scheduledInsights.map(post => post.slug)).size, 37);
  assert.deepEqual(scheduledInsights.filter(post => excluded.has(post.campaignId)), []);
});

test("scheduled Insights carry substantial, search-readable content", () => {
  for (const post of scheduledInsights) {
    assert.ok(post.title.length >= 24, post.slug);
    assert.ok(post.excerpt.length >= 100, post.slug);
    assert.ok(post.body.split(/\s+/).length >= 450, post.slug);
    assert.ok(post.body.includes("## Frequently asked questions"), post.slug);
    assert.ok(post.body.includes("## Sources and further reading"), post.slug);
    assert.equal(post.faqs.length, 3, post.slug);
    assert.ok(post.keywords.length >= 4, post.slug);
  }
});

test("an Insight is not public before its matching email date", () => {
  const first = scheduledInsights[0];
  const justBefore = new Date(first.publishedAt.getTime() - 1);
  const atSendTime = new Date(first.publishedAt);
  assert.equal(liveScheduledInsights(justBefore).some(post => post.slug === first.slug), false);
  assert.equal(liveScheduledInsights(atSendTime).some(post => post.slug === first.slug), true);
});
