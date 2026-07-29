import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { productReviews } from "../../../db/schema";
import { products } from "../../data";
import { isAuthenticated, adminTokenConfigured } from "../../../lib/admin-auth";
import { signOut } from "../orders/actions";
import { setReviewStatus, setReviewVerified } from "./actions";
import SignInForm from "../orders/SignInForm";

// Review rows hold contact PII (email), so this view must never be cached,
// prerendered, or indexed — same posture as the orders and support views.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Reviews — Wynn Essentials",
  robots: { index: false, follow: false, nocache: true },
};

const when = (value: Date | null) =>
  value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—";
const productName = (slug: string) => {
  const p = products.find(x => x.slug === slug);
  return p ? `${p.name} ${p.subtitle}` : slug;
};
const stars = (n: number) => "★★★★★☆☆☆☆☆".slice(5 - Math.max(0, Math.min(5, n)), 10 - Math.max(0, Math.min(5, n)));

const STATUS_COLOR: Record<string, string> = { approved: "#15803d", rejected: "#b91c1c", pending: "#b45309" };

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="order-page" style={{ maxWidth: "64rem" }}>{children}</main>;
}

export default async function AdminReviews() {
  if (!adminTokenConfigured()) {
    return <Shell><p className="eyebrow">REVIEWS</p><h1>Reviews are not configured.</h1><p>Set <code>ADMIN_ORDERS_TOKEN</code> to a random value of at least 16 characters in the Vercel environment, then reload. Until it is set this page stays closed, because these reviews carry customer email addresses.</p></Shell>;
  }
  if (!(await isAuthenticated())) return <Shell><SignInForm /></Shell>;

  let rows: (typeof productReviews.$inferSelect)[] = [];
  let error: string | null = null;
  try {
    rows = await getDb().select().from(productReviews).orderBy(desc(productReviews.createdAt)).limit(500);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Unknown error";
  }

  const pending = rows.filter(r => r.status === "pending").length;

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <div><p className="eyebrow">CUSTOMER REVIEWS</p><h1>Reviews</h1></div>
        <form action={signOut}><button className="outline-button" type="submit">Sign out</button></form>
      </div>
      <p style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}><Link href="/admin">← Admin home</Link><Link href="/admin/orders">Orders</Link><Link href="/admin/support">Support</Link></p>

      {error ? (
        <p role="alert" style={{ background: "#faf0e6", padding: "0.8rem 1rem", borderRadius: 4 }}>Could not read reviews: {error}. If the reviews table isn’t set up yet, run the <code>product_reviews</code> migration first.</p>
      ) : (
        <>
          <p>{rows.length === 0 ? "No reviews submitted yet." : `${rows.length} review${rows.length === 1 ? "" : "s"}, ${pending} pending approval.`} Only approved reviews appear on the storefront.</p>

          <div style={{ display: "grid", gap: "1rem" }}>
            {rows.map(row => {
              const color = STATUS_COLOR[row.status] ?? "#6d675f";
              return (
                <article key={row.id} style={{ border: "1px solid var(--line)", borderLeft: `4px solid ${color}`, borderRadius: 4, padding: "1rem 1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
                    <div>
                      <strong>{row.author}</strong>{" "}
                      <a href={`mailto:${row.email}`}>{row.email}</a>
                      {row.verified ? <span style={{ marginLeft: 8, fontSize: "0.75rem", fontWeight: 700, color: "#15803d" }}>✔ Verified buyer</span> : null}
                      <div style={{ opacity: 0.7, fontSize: "0.85rem", marginTop: 2 }}>
                        {when(row.createdAt)} · {productName(row.productSlug)}
                      </div>
                    </div>
                    <span style={{ whiteSpace: "nowrap", fontWeight: 700, color, textTransform: "capitalize" }}>{row.status}</span>
                  </div>
                  <p style={{ margin: "0.75rem 0 0", color: "#b45309", letterSpacing: "2px" }} aria-label={`${row.rating} out of 5 stars`}>{stars(row.rating)}</p>
                  {row.title ? <p style={{ fontWeight: 700, margin: "0.4rem 0 0" }}>{row.title}</p> : null}
                  <p style={{ whiteSpace: "pre-wrap", marginTop: "0.4rem" }}>{row.body}</p>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                    {row.status !== "approved" && (
                      <form action={setReviewStatus}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="status" value="approved" /><button className="button" type="submit" style={{ minHeight: 40, padding: "8px 14px" }}>Approve</button></form>
                    )}
                    {row.status !== "rejected" && (
                      <form action={setReviewStatus}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="status" value="rejected" /><button className="outline-button" type="submit" style={{ minHeight: 40, padding: "8px 14px" }}>Reject</button></form>
                    )}
                    {row.status !== "pending" && (
                      <form action={setReviewStatus}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="status" value="pending" /><button className="outline-button" type="submit" style={{ minHeight: 40, padding: "8px 14px" }}>Reset to pending</button></form>
                    )}
                    <form action={setReviewVerified}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="verified" value={row.verified ? "false" : "true"} /><button className="outline-button" type="submit" style={{ minHeight: 40, padding: "8px 14px" }}>{row.verified ? "Remove verified badge" : "Mark verified"}</button></form>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </Shell>
  );
}
