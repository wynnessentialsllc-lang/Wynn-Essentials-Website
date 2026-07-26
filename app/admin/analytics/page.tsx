import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { orders } from "../../../db/schema";
import { isAuthenticated, adminTokenConfigured } from "../../../lib/admin-auth";
import { signOut } from "../orders/actions";
import SignInForm from "../orders/SignInForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Analytics — Wynn Essentials",
  robots: { index: false, follow: false, nocache: true },
};

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const RANGES = [7, 30, 90, 365];
const n = (v: number | null) => v ?? 0;

function delta(cur: number, prev: number) {
  if (prev === 0) return cur === 0 ? { txt: "—", up: null as boolean | null } : { txt: "New", up: true };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { txt: `${pct > 0 ? "+" : ""}${pct}%`, up: pct >= 0 };
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="order-page" style={{ maxWidth: "72rem" }}>{children}</main>;
}

type Row = { createdAt: Date | null; customerEmail: string | null; subtotalAmount: number | null; shippingAmount: number | null; taxAmount: number | null; discountAmount: number | null; totalAmount: number | null; fulfillmentStatus: string; items: unknown };

export default async function AdminAnalytics({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  if (!adminTokenConfigured()) return <Shell><p className="eyebrow">ANALYTICS</p><h1>Analytics is not configured.</h1><p>Set <code>ADMIN_ORDERS_TOKEN</code> in Vercel to open this page.</p></Shell>;
  if (!(await isAuthenticated())) return <Shell><SignInForm /></Shell>;

  const { days: daysParam } = await searchParams;
  const days = RANGES.includes(Number(daysParam)) ? Number(daysParam) : 30;
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);
  const prevSince = new Date(since.getTime() - days * 86_400_000);

  let all: Row[] = [];
  let error: string | null = null;
  try {
    all = await getDb().select({
      createdAt: orders.createdAt, customerEmail: orders.customerEmail,
      subtotalAmount: orders.subtotalAmount, shippingAmount: orders.shippingAmount,
      taxAmount: orders.taxAmount, discountAmount: orders.discountAmount,
      totalAmount: orders.totalAmount, fulfillmentStatus: orders.fulfillmentStatus, items: orders.items,
    }).from(orders).where(eq(orders.status, "paid")) as Row[];
  } catch (e) { error = e instanceof Error ? e.message : "Unknown error"; }

  const inRange = (r: Row, a: Date, b: Date) => r.createdAt != null && r.createdAt >= a && r.createdAt < b;
  const period = all.filter(r => inRange(r, since, now));
  const prev = all.filter(r => inRange(r, prevSince, since));

  const sum = (rows: Row[], f: (r: Row) => number | null) => rows.reduce((s, r) => s + n(f(r)), 0);
  const gross = sum(period, r => n(r.subtotalAmount) + n(r.discountAmount));
  const discounts = sum(period, r => r.discountAmount);
  const netSales = sum(period, r => r.subtotalAmount);
  const shipping = sum(period, r => r.shippingAmount);
  const taxes = sum(period, r => r.taxAmount);
  const total = sum(period, r => r.totalAmount);
  const prevTotal = sum(prev, r => r.totalAmount);
  const ordersCount = period.length;
  const fulfilled = period.filter(r => r.fulfillmentStatus === "fulfilled").length;
  const aov = ordersCount ? Math.round(total / ordersCount) : 0;
  const prevAov = prev.length ? Math.round(prevTotal / prev.length) : 0;

  // Returning-customer rate: of the distinct customers who ordered in this period,
  // how many had already placed an order before the period began.
  const firstSeen = new Map<string, number>();
  for (const r of all) { if (!r.customerEmail || !r.createdAt) continue; const t = r.createdAt.getTime(); const cur = firstSeen.get(r.customerEmail); if (cur == null || t < cur) firstSeen.set(r.customerEmail, t); }
  const periodCustomers = new Set(period.map(r => r.customerEmail).filter(Boolean) as string[]);
  const returning = [...periodCustomers].filter(e => (firstSeen.get(e) ?? Infinity) < since.getTime()).length;
  const returnRate = periodCustomers.size ? Math.round((returning / periodCustomers.size) * 100) : 0;

  // Daily totals for the sales-over-time chart.
  const buckets = Array.from({ length: days }, (_, i) => { const d = new Date(since.getTime() + i * 86_400_000); return { label: d, cents: 0 }; });
  for (const r of period) { if (!r.createdAt) continue; const idx = Math.floor((r.createdAt.getTime() - since.getTime()) / 86_400_000); if (idx >= 0 && idx < buckets.length) buckets[idx].cents += n(r.totalAmount); }
  const maxDaily = Math.max(1, ...buckets.map(b => b.cents));
  const W = 900, H = 200;
  const pts = buckets.map((b, i) => `${(i / Math.max(1, buckets.length - 1)) * W},${H - (b.cents / maxDaily) * (H - 12) - 6}`).join(" ");

  // Sales by product.
  const byProduct = new Map<string, { revenue: number; qty: number }>();
  for (const r of period) { const items = Array.isArray(r.items) ? r.items as { name?: string; quantity?: number; totalAmount?: number; selectionLabel?: string }[] : []; for (const it of items) { if (it.selectionLabel || !it.name) continue; const cur = byProduct.get(it.name) ?? { revenue: 0, qty: 0 }; cur.revenue += n(it.totalAmount ?? 0); cur.qty += Number(it.quantity ?? 0); byProduct.set(it.name, cur); } }
  const topProducts = [...byProduct.entries()].sort((a, b) => b[1].revenue - a[1].revenue);

  const tiles = [
    { label: "Gross sales", value: money(gross), d: delta(gross, sum(prev, r => n(r.subtotalAmount) + n(r.discountAmount))) },
    { label: "Total sales", value: money(total), d: delta(total, prevTotal) },
    { label: "Orders", value: String(ordersCount), d: delta(ordersCount, prev.length) },
    { label: "Orders fulfilled", value: String(fulfilled), d: delta(fulfilled, prev.filter(r => r.fulfillmentStatus === "fulfilled").length) },
    { label: "Average order value", value: money(aov), d: delta(aov, prevAov) },
    { label: "Returning customer rate", value: `${returnRate}%`, d: { txt: "—", up: null as boolean | null } },
  ];
  const breakdown = [
    ["Gross sales", gross], ["Discounts", -discounts], ["Net sales", netSales],
    ["Shipping charges", shipping], ["Taxes", taxes], ["Total sales", total],
  ] as [string, number][];

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <div><p className="eyebrow">ANALYTICS</p><h1>Analytics</h1></div>
        <form action={signOut}><button className="outline-button" type="submit">Sign out</button></form>
      </div>
      <p style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}><Link href="/admin">← Admin home</Link><Link href="/admin/orders">Orders</Link></p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0.5rem 0 1.5rem" }}>
        {RANGES.map(r => <Link key={r} href={`/admin/analytics?days=${r}`} style={{ padding: "8px 14px", border: "1px solid var(--line)", borderRadius: 999, textDecoration: "none", background: r === days ? "var(--kraft)" : "transparent", fontSize: 13 }}>{r === 365 ? "Last year" : `Last ${r} days`}</Link>)}
      </div>

      {error ? <p role="alert">Could not load analytics: {error}. If the orders table isn’t set up yet, this fills in once orders come in.</p> : <>
        <p style={{ opacity: 0.7, marginTop: "-0.5rem" }}>Compared with the previous {days} days. {ordersCount === 0 ? "No paid orders in this range yet — this populates as you make sales." : ""}</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "1rem", margin: "1rem 0 2rem" }}>
          {tiles.map(t => (
            <div key={t.label} style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "1rem 1.1rem" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{t.label}</div>
              <div style={{ fontSize: 26, fontWeight: 600, marginTop: 4 }}>{t.value}</div>
              <div style={{ fontSize: 12, marginTop: 4, color: t.d.up == null ? "inherit" : t.d.up ? "#15803d" : "#b91c1c" }}>{t.d.txt}</div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: "1.4rem", margin: "0 0 0.5rem" }}>Total sales over time</h2>
        <div style={{ fontSize: 22, fontWeight: 600 }}>{money(total)}</div>
        <div style={{ overflowX: "auto", margin: "0.75rem 0 2rem" }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="200" preserveAspectRatio="none" style={{ border: "1px solid var(--line)", borderRadius: 6, background: "#fff", minWidth: 480 }}>
            <polyline points={`0,${H} ${pts} ${W},${H}`} fill="var(--kraft)" fillOpacity="0.15" stroke="none" />
            <polyline points={pts} fill="none" stroke="var(--kraft-dark)" strokeWidth="2.5" />
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.6, marginTop: 4 }}>
            <span>{since.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            <span>peak {money(maxDaily)}/day</span>
            <span>{now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          </div>
        </div>

        <h2 style={{ fontSize: "1.4rem", margin: "0 0 0.75rem" }}>Total sales breakdown</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem", fontSize: "0.95rem" }}>
          <tbody>{breakdown.map(([label, cents], i) => (
            <tr key={label} style={{ borderBottom: "1px solid rgba(128,128,128,0.25)", fontWeight: label === "Total sales" || label === "Net sales" ? 700 : 400 }}>
              <td style={{ padding: "0.6rem 0.5rem" }}>{label}</td>
              <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>{i === 1 && cents !== 0 ? `−${money(Math.abs(cents))}` : money(cents)}</td>
            </tr>
          ))}</tbody>
        </table>

        <h2 style={{ fontSize: "1.4rem", margin: "0 0 0.75rem" }}>Total sales by product</h2>
        {topProducts.length === 0 ? <p style={{ opacity: 0.7 }}>No product sales in this range.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem", fontSize: "0.95rem" }}>
            <thead><tr>{["Product", "Units", "Revenue"].map(h => <th key={h} style={{ textAlign: h === "Product" ? "left" : "right", padding: "0.5rem", borderBottom: "2px solid currentColor" }}>{h}</th>)}</tr></thead>
            <tbody>{topProducts.map(([name, v]) => (
              <tr key={name} style={{ borderBottom: "1px solid rgba(128,128,128,0.25)" }}>
                <td style={{ padding: "0.6rem 0.5rem" }}>{name}</td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>{v.qty}</td>
                <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>{money(v.revenue)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}

        <div style={{ border: "1px dashed var(--line)", borderRadius: 6, padding: "1rem 1.25rem", opacity: 0.85 }}>
          <strong>Traffic metrics (Sessions, Conversion rate, Device)</strong>
          <p style={{ margin: "6px 0 0", fontSize: 14 }}>These need website visitor tracking, which this store doesn’t collect. Turn on <strong>Vercel Web Analytics</strong> (Vercel dashboard → your project → Analytics) to see sessions, top pages, and devices there.</p>
        </div>
      </>}
    </Shell>
  );
}
