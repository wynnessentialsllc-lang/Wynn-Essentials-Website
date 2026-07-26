import type { Metadata } from "next";
import Link from "next/link";
import { eq, gte, and } from "drizzle-orm";
import { getDb } from "../../../db";
import { events, orders } from "../../../db/schema";
import { products } from "../../data";
import { isAuthenticated, adminTokenConfigured } from "../../../lib/admin-auth";
import { signOut } from "../orders/actions";
import SignInForm from "../orders/SignInForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Traffic — Wynn Essentials",
  robots: { index: false, follow: false, nocache: true },
};

const RANGES = [7, 30, 90];
const NAME = new Map(products.map(p => [p.slug, p.name]));

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="order-page" style={{ maxWidth: "72rem" }}>{children}</main>;
}

function Bars({ data, labelEvery = 1 }: { data: { label: string; value: number }[]; labelEvery?: number }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 160, border: "1px solid var(--line)", borderRadius: 6, padding: "10px 8px 0", overflowX: "auto" }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: "1 0 auto", minWidth: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }} title={`${d.label}: ${d.value}`}>
          <span style={{ fontSize: 9, opacity: d.value ? 0.7 : 0, marginBottom: 2 }}>{d.value || ""}</span>
          <div style={{ width: "70%", maxWidth: 26, height: `${(d.value / max) * 100}%`, minHeight: d.value ? 3 : 0, background: "var(--kraft-dark)", borderRadius: "2px 2px 0 0" }} />
          <span style={{ fontSize: 9, opacity: 0.55, marginTop: 3, whiteSpace: "nowrap" }}>{i % labelEvery === 0 ? d.label : ""}</span>
        </div>
      ))}
    </div>
  );
}

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

  // Daily unique visitors across the range.
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const dailySets = new Map<string, Set<string>>();
  for (let i = 0; i < days; i++) dailySets.set(dayKey(new Date(since.getTime() + i * 86_400_000)), new Set());
  for (const r of rows) { if (!r.createdAt) continue; const k = dayKey(r.createdAt); dailySets.get(k)?.add(r.visitorId); }
  const daily = [...dailySets.entries()].map(([k, s]) => ({ label: k.slice(5), value: s.size }));

  // Unique visitors by hour of day (0–23), across the whole range.
  const hourSets = Array.from({ length: 24 }, () => new Set<string>());
  for (const r of rows) { if (!r.createdAt) continue; hourSets[r.createdAt.getHours()].add(r.visitorId); }
  const hourly = hourSets.map((s, h) => ({ label: `${h}`, value: s.size }));

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

      <h2 style={{ fontSize: "1.4rem", margin: "0 0 0.6rem" }}>Visitors per day</h2>
      <div style={{ marginBottom: "2rem" }}><Bars data={daily} labelEvery={Math.ceil(days / 12)} /></div>

      <h2 style={{ fontSize: "1.4rem", margin: "0 0 0.6rem" }}>Visitors by hour of day</h2>
      <p style={{ opacity: 0.7, marginTop: 0 }}>When people tend to visit (all days combined, 0–23h).</p>
      <div style={{ marginBottom: "2rem" }}><Bars data={hourly} labelEvery={2} /></div>

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
