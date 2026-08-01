import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, ne, count } from "drizzle-orm";
import { getDb } from "../../db";
import { orders, productReviews, supportMessages } from "../../db/schema";
import { isAuthenticated, adminTokenConfigured } from "../../lib/admin-auth";
import { signOut } from "./orders/actions";
import SignInForm from "./orders/SignInForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Admin — Wynn Essentials",
  robots: { index: false, follow: false, nocache: true },
};

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="order-page" style={{ maxWidth: "48rem" }}>{children}</main>;
}

// `badge` names the attention-count for a section (see attentionCounts). A count
// above zero renders a red indicator with the number of items needing action.
type BadgeKey = "orders" | "reviews" | "support";
type Section = { href: string; title: string; blurb: string; badge?: BadgeKey };
const SECTIONS: Section[] = [
  { href: "/admin/analytics", title: "Analytics", blurb: "Sales, orders, average order value, and top products." },
  { href: "/admin/traffic", title: "Traffic", blurb: "Visitors by day and hour, viewed products, and the cart→checkout funnel." },
  { href: "/admin/orders", title: "Orders", blurb: "View paid orders and mark them fulfilled.", badge: "orders" },
  { href: "/admin/inventory", title: "Inventory", blurb: "Track stock counts and mark products sold out or back in stock." },
  { href: "/admin/support", title: "Support", blurb: "Customer messages from the contact form. Mark them resolved.", badge: "support" },
  { href: "/admin/reviews", title: "Reviews", blurb: "Approve, reject, or verify customer product reviews before they publish.", badge: "reviews" },
  { href: "/admin/subscribers", title: "Subscribers", blurb: "Newsletter and product-waitlist signups." },
];

// Counts the items awaiting action in each section: paid-but-unfulfilled orders,
// reviews pending approval, and unresolved support messages. Every count fails
// closed to 0 so a database hiccup never blocks the admin home from rendering.
async function attentionCounts(): Promise<{ orders: number; reviews: number; support: number }> {
  const db = getDb();
  const one = async (query: Promise<{ n: number }[]>) => {
    try { return (await query)[0]?.n ?? 0; } catch { return 0; }
  };
  const [ordersN, reviewsN, supportN] = await Promise.all([
    one(db.select({ n: count() }).from(orders).where(and(eq(orders.status, "paid"), ne(orders.fulfillmentStatus, "fulfilled")))),
    one(db.select({ n: count() }).from(productReviews).where(eq(productReviews.status, "pending"))),
    one(db.select({ n: count() }).from(supportMessages).where(eq(supportMessages.status, "new"))),
  ]);
  return { orders: ordersN, reviews: reviewsN, support: supportN };
}

export default async function AdminHome() {
  if (!adminTokenConfigured()) {
    return <Shell><p className="eyebrow">ADMIN</p><h1>Admin is not configured.</h1><p>Set <code>ADMIN_ORDERS_TOKEN</code> in the Vercel environment to open this area.</p></Shell>;
  }
  if (!(await isAuthenticated())) return <Shell><SignInForm /></Shell>;

  const counts = await attentionCounts();

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <div><p className="eyebrow">WYNN ESSENTIALS</p><h1>Admin</h1></div>
        <form action={signOut}><button className="outline-button" type="submit">Sign out</button></form>
      </div>
      <div style={{ display: "grid", gap: "1rem", marginTop: "1.5rem" }}>
        {SECTIONS.map(s => {
          const n = s.badge ? counts[s.badge] : 0;
          return (
            <Link key={s.href} href={s.href} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", padding: "1.25rem 1.5rem", border: "1px solid var(--line)", borderRadius: 4, textDecoration: "none" }}>
              <div>
                <strong style={{ fontSize: "1.15rem" }}>{s.title}</strong>
                <div style={{ opacity: 0.75, marginTop: 4 }}>{s.blurb}</div>
              </div>
              {n > 0 && (
                <span
                  aria-label={`${n} needing attention`}
                  style={{ flex: "0 0 auto", minWidth: 24, height: 24, padding: "0 8px", borderRadius: 999, background: "#c0392b", color: "#fff", fontSize: 13, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                >
                  {n}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </Shell>
  );
}
