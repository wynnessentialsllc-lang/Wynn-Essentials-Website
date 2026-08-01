import type { Metadata } from "next";
import Link from "next/link";
import { eq, gte, and } from "drizzle-orm";
import { getDb } from "../../../db";
import { events, orders } from "../../../db/schema";
import { products } from "../../data";
import { isAuthenticated, adminTokenConfigured } from "../../../lib/admin-auth";
import { signOut } from "../orders/actions";
import SignInForm from "../orders/SignInForm";
import TrafficCharts, { type Bar } from "./TrafficCharts";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Traffic — Wynn Essentials",
  robots: { index: false, follow: false, nocache: true },
};

const RANGES = [7, 30, 90];
const NAME = new Map(products.map(p => [p.slug, p.name]));
const productName = (slug: string) => NAME.get(slug) ?? slug;
const when = (value: Date | null) =>
  value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—";

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="order-page" style={{ maxWidth: "72rem" }}>{children}</main>;
}

// Per-bucket tally: unique visitors plus a count of each event type, used for
// the clickable chart breakdowns.
type Bucket = { visitors: Set<string>; pageview: number; product_view: number; add_to_cart: number; begin_checkout: number };
const newBucket = (): Bucket => ({ visitors: new Set(), pageview: 0, product_view: 0, add_to_cart: 0, begin_checkout: 0 });
const bucketBreakdown = (b: Bucket) => ({ "Page views": b.pageview, "Product views": b.product_view, "Add to cart": b.add_to_cart, "Reached checkout": b.begin_checkout });

export default async function AdminTraffic({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  if (!adminTokenConfigured()) return <Shell><p className="eyebrow">TRAFFIC</p><h1>Traffic is not configured.</h1><p>Set <code>ADMIN_ORDERS_TOKEN</code> in Vercel to open this page.</p></Shell>;
  if (!(await isAuthenticated())) return <Shell><SignInForm /></Shell>;

  const { days: daysParam } = await searchParams;
  const days = RANGES.includes(Number(daysParam)) ? Number(daysParam) : 30;
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);

  let rows: { visitorId: string; type: string; path: string | null; productSlug: string | null; createdAt: Date | null }[] = [];
  let purchases = 0;
  let error: string | null = null;
  try {
    const db = getDb();
    rows = await db.select({ visitorId: events.visitorId, type: events.type, path: events.path, productSlug: events.productSlug, createdAt: events.createdAt }).from(events).where(gte(events.createdAt, since));
    const paid = await db.select({ createdAt: orders.createdAt }).from(orders).where(and(eq(orders.status, "paid"), gte(orders.createdAt, since)));
    purchases = paid.length;
  } catch (e) { error = e instanceof Error ? e.message : "Unknown error"; }

  if (error) {
    return <Shell><p className="eyebrow">TRAFFIC</p><h1>Traffic</h1><p role="alert" style={{ background: "#faf0e6", padding: "0.8rem 1rem", borderRadius: 4 }}>The <code>events</code> table isn’t set up yet, so there’s nothing to show. Run the <code>events</code> migration, then visitor data starts collecting. ({error})</p></Shell>;
  }

  const visitorsWith = (type?: string) => new Set(rows.filter(r => !type || r.type === type).map(r => r.visitorId)).size;
  const visitors = visitorsWith();
  const addedToCart = visitorsWith("add_to_cart");
  const beganCheckout = visitorsWith("begin_checkout");
  const abandonedCart = Math.max(0, addedToCart - beganCheckout);
  const abandonedCheckout = Math.max(0, beganCheckout - purchases);

  const bump = (b: Bucket, r: typeof rows[number]) => {
    b.visitors.add(r.visitorId);
    if (r.type === "pageview" || r.type === "product_view" || r.type === "add_to_cart" || r.type === "begin_checkout") b[r.type] += 1;
  };

  // Daily unique visitors (with event breakdown) across the range.
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const dailyBuckets = new Map<string, Bucket>();
  for (let i = 0; i < days; i++) dailyBuckets.set(dayKey(new Date(since.getTime() + i * 86_400_000)), newBucket());
  for (const r of rows) { if (!r.createdAt) continue; const b = dailyBuckets.get(dayKey(r.createdAt)); if (b) bump(b, r); }
  const daily: Bar[] = [...dailyBuckets.entries()].map(([k, b]) => ({ label: k.slice(5), value: b.visitors.size, breakdown: bucketBreakdown(b) }));

  // Unique visitors by hour of day (0–23, with breakdown), across the range.
  const hourBuckets = Array.from({ length: 24 }, newBucket);
  for (const r of rows) { if (!r.createdAt) continue; bump(hourBuckets[r.createdAt.getHours()], r); }
  const hourly: Bar[] = hourBuckets.map((b, h) => ({ label: `${h}`, value: b.visitors.size, breakdown: bucketBreakdown(b) }));

  // Abandoned carts: visitors who added something but never reached checkout.
  // Each add_to_cart event carries the product, so we can show exactly what was
  // left behind. begin_checkout carries no product, hence the "added but no
  // checkout" definition here.
  type Cart = { added: Map<string, number>; checkout: boolean; last: Date | null };
  const carts = new Map<string, Cart>();
  for (const r of rows) {
    let c = carts.get(r.visitorId);
    if (!c) { c = { added: new Map(), checkout: false, last: null }; carts.set(r.visitorId, c); }
    if (r.type === "add_to_cart" && r.productSlug) c.added.set(r.productSlug, (c.added.get(r.productSlug) ?? 0) + 1);
    if (r.type === "begin_checkout") c.checkout = true;
    if (r.createdAt && (!c.last || r.createdAt > c.last)) c.last = r.createdAt;
  }
  const abandonedCarts = [...carts.values()]
    .filter(c => c.added.size > 0 && !c.checkout)
    .map(c => ({ items: [...c.added.keys()], last: c.last }))
    .sort((a, b) => (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0));
  // Which products show up most often in abandoned carts.
  const abandonedProducts = new Map<string, number>();
  for (const c of abandonedCarts) for (const slug of c.items) abandonedProducts.set(slug, (abandonedProducts.get(slug) ?? 0) + 1);
  const topAbandoned = [...abandonedProducts.entries()].sort((a, b) => b[1] - a[1]);

  const countBy = (type: string, key: (r: typeof rows[number]) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) { if (r.type !== type) continue; const k = key(r); if (!k) continue; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const topProducts = countBy("product_view", r => r.productSlug);
  const topPages = countBy("pageview", r => r.path);

  const tiles = [
    { label: "Visitors", value: visitors },
    { label: "Added to cart", value: addedToCart },
    { label: "Reached checkout", value: beganCheckout },
    { label: "Purchases", value: purchases },
  ];
  const funnel = [
    { label: "Visited the site", value: visitors },
    { label: "Added to cart", value: addedToCart },
    { label: "Reached checkout", value: beganCheckout },
    { label: "Purchased", value: purchases },
  ];

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <div><p className="eyebrow">TRAFFIC</p><h1>Traffic</h1></div>
        <form action={signOut}><button className="outline-button" type="submit">Sign out</button></form>
      </div>
      <p style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}><Link href="/admin">← Admin home</Link><Link href="/admin/analytics">Sales analytics</Link></p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0.5rem 0 1.5rem" }}>
        {RANGES.map(r => <Link key={r} href={`/admin/traffic?days=${r}`} style={{ padding: "8px 14px", border: "1px solid var(--line)", borderRadius: 999, textDecoration: "none", background: r === days ? "var(--kraft)" : "transparent", fontSize: 13 }}>Last {r} days</Link>)}
      </div>

      {visitors === 0 && <p style={{ opacity: 0.7 }}>No visitor activity recorded in this range yet — data collects as people browse the site.</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "1rem", margin: "0 0 2rem" }}>
        {tiles.map(t => <div key={t.label} style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "1rem 1.1rem" }}><div style={{ fontSize: 12, opacity: 0.7 }}>{t.label}</div><div style={{ fontSize: 26, fontWeight: 600, marginTop: 4 }}>{t.value}</div></div>)}
      </div>

      <TrafficCharts daily={daily} hourly={hourly} dailyLabelEvery={Math.ceil(days / 12)} />

      <h2 style={{ fontSize: "1.4rem", margin: "0 0 0.75rem" }}>Conversion funnel</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "0.5rem", fontSize: "0.95rem" }}>
        <tbody>{funnel.map((f, i) => (
          <tr key={f.label} style={{ borderBottom: "1px solid rgba(128,128,128,0.25)" }}>
            <td style={{ padding: "0.6rem 0.5rem" }}>{f.label}</td>
            <td style={{ padding: "0.6rem 0.5rem", textAlign: "right", fontWeight: 600 }}>{f.value}</td>
            <td style={{ padding: "0.6rem 0.5rem", textAlign: "right", opacity: 0.6 }}>{i > 0 && funnel[0].value ? `${Math.round((f.value / funnel[0].value) * 100)}% of visitors` : ""}</td>
          </tr>
        ))}</tbody>
      </table>
      <p style={{ opacity: 0.85, marginBottom: "2rem" }}>
        <strong>{addedToCart ? Math.round((abandonedCart / addedToCart) * 100) : 0}%</strong> abandoned cart ({abandonedCart} added but never reached checkout) · <strong>{beganCheckout ? Math.round((abandonedCheckout / beganCheckout) * 100) : 0}%</strong> abandoned checkout ({abandonedCheckout} reached checkout but didn’t purchase).
      </p>

      <h2 style={{ fontSize: "1.4rem", margin: "0 0 0.6rem" }}>Abandoned carts</h2>
      {abandonedCarts.length === 0 ? (
        <p style={{ opacity: 0.7, marginBottom: "2rem" }}>No abandoned carts in this range — everyone who added to cart reached checkout.</p>
      ) : (
        <div style={{ display: "grid", gap: "2rem", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", marginBottom: "2rem" }}>
          <div>
            <h3 style={{ fontSize: "1.05rem", margin: "0 0 0.5rem" }}>Most-abandoned products</h3>
            <p style={{ opacity: 0.7, marginTop: 0, fontSize: 13 }}>Items added to cart but left behind, ranked by how often.</p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <tbody>{topAbandoned.map(([slug, c]) => (
                <tr key={slug} style={{ borderBottom: "1px solid rgba(128,128,128,0.2)" }}>
                  <td style={{ padding: "0.5rem" }}>{productName(slug)}</td>
                  <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: 600 }}>{c}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div>
            <h3 style={{ fontSize: "1.05rem", margin: "0 0 0.5rem" }}>Recent abandoned carts ({abandonedCarts.length})</h3>
            <p style={{ opacity: 0.7, marginTop: 0, fontSize: 13 }}>What each shopper left in their cart, newest first.</p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead><tr>{["Items left in cart", "Last active"].map(h => <th key={h} style={{ textAlign: "left", padding: "0.5rem", borderBottom: "2px solid currentColor" }}>{h}</th>)}</tr></thead>
              <tbody>{abandonedCarts.slice(0, 40).map((c, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(128,128,128,0.2)", verticalAlign: "top" }}>
                  <td style={{ padding: "0.5rem" }}>{c.items.map(productName).join(", ")}</td>
                  <td style={{ padding: "0.5rem", whiteSpace: "nowrap", opacity: 0.75 }}>{when(c.last)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: "2rem", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        <div>
          <h2 style={{ fontSize: "1.2rem", margin: "0 0 0.6rem" }}>Most-viewed products</h2>
          {topProducts.length === 0 ? <p style={{ opacity: 0.7 }}>No product views yet.</p> : <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}><tbody>{topProducts.slice(0, 12).map(([slug, c]) => <tr key={slug} style={{ borderBottom: "1px solid rgba(128,128,128,0.2)" }}><td style={{ padding: "0.5rem" }}>{NAME.get(slug) ?? slug}</td><td style={{ padding: "0.5rem", textAlign: "right" }}>{c}</td></tr>)}</tbody></table>}
        </div>
        <div>
          <h2 style={{ fontSize: "1.2rem", margin: "0 0 0.6rem" }}>Most-viewed pages</h2>
          {topPages.length === 0 ? <p style={{ opacity: 0.7 }}>No page views yet.</p> : <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}><tbody>{topPages.slice(0, 12).map(([path, c]) => <tr key={path} style={{ borderBottom: "1px solid rgba(128,128,128,0.2)" }}><td style={{ padding: "0.5rem", wordBreak: "break-all" }}>{path}</td><td style={{ padding: "0.5rem", textAlign: "right" }}>{c}</td></tr>)}</tbody></table>}
        </div>
      </div>
    </Shell>
  );
}
