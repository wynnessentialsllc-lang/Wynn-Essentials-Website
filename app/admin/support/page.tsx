import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { supportMessages } from "../../../db/schema";
import { isAuthenticated, adminTokenConfigured } from "../../../lib/admin-auth";
import { signOut } from "../orders/actions";
import { setSupportStatus } from "./actions";
import SignInForm from "../orders/SignInForm";

// Support rows hold contact PII (name, email), so this view must never be
// cached, prerendered, or indexed — same posture as the orders view.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Support — Wynn Essentials",
  robots: { index: false, follow: false, nocache: true },
};

const when = (value: Date | null) =>
  value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—";

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="order-page" style={{ maxWidth: "64rem" }}>{children}</main>;
}

export default async function AdminSupport() {
  if (!adminTokenConfigured()) {
    return <Shell><p className="eyebrow">SUPPORT</p><h1>Support inbox is not configured.</h1><p>Set <code>ADMIN_ORDERS_TOKEN</code> to a random value of at least 16 characters in the Vercel environment, then reload. Until it is set this page stays closed, because these messages contain customer contact details.</p></Shell>;
  }
  if (!(await isAuthenticated())) return <Shell><SignInForm /></Shell>;

  let rows: (typeof supportMessages.$inferSelect)[] = [];
  let error: string | null = null;
  try {
    rows = await getDb().select().from(supportMessages).orderBy(desc(supportMessages.createdAt)).limit(500);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Unknown error";
  }

  const open = rows.filter(r => r.status !== "resolved").length;

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <div><p className="eyebrow">CUSTOMER SUPPORT</p><h1>Support</h1></div>
        <form action={signOut}><button className="outline-button" type="submit">Sign out</button></form>
      </div>
      <p style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}><Link href="/admin">← Admin home</Link><Link href="/admin/orders">Orders</Link></p>

      {error ? (
        <p role="alert" style={{ background: "#faf0e6", padding: "0.8rem 1rem", borderRadius: 4 }}>Could not read messages: {error}. If the support table isn’t set up yet, run the <code>support_messages</code> migration first.</p>
      ) : (
        <>
          <p>{rows.length === 0 ? "No messages yet." : `${rows.length} message${rows.length === 1 ? "" : "s"}, ${open} open.`}</p>

          <div style={{ display: "grid", gap: "1rem" }}>
            {rows.map(row => {
              const resolved = row.status === "resolved";
              return (
                <article key={row.id} style={{ border: "1px solid var(--line)", borderLeft: `4px solid ${resolved ? "#15803d" : "#b45309"}`, borderRadius: 4, padding: "1rem 1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
                    <div>
                      <strong>{row.name}</strong>{" "}
                      <a href={`mailto:${row.email}${row.orderNumber ? `?subject=${encodeURIComponent(`Your Wynn Essentials order ${row.orderNumber}`)}` : ""}`}>{row.email}</a>
                      <div style={{ opacity: 0.7, fontSize: "0.85rem", marginTop: 2 }}>
                        {when(row.createdAt)}
                        {row.topic ? ` · ${row.topic}` : ""}
                        {row.orderNumber ? ` · Order ${row.orderNumber}` : ""}
                      </div>
                    </div>
                    <span style={{ whiteSpace: "nowrap", fontWeight: 700, color: resolved ? "#15803d" : "#b45309" }}>{resolved ? "Resolved" : "Open"}</span>
                  </div>
                  <p style={{ whiteSpace: "pre-wrap", marginTop: "0.75rem" }}>{row.message}</p>
                  <form action={setSupportStatus} style={{ marginTop: "0.5rem" }}>
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="status" value={resolved ? "new" : "resolved"} />
                    <button className="outline-button" type="submit" style={{ minHeight: 40, padding: "8px 12px" }}>{resolved ? "Reopen" : "Mark resolved"}</button>
                  </form>
                </article>
              );
            })}
          </div>
        </>
      )}
    </Shell>
  );
}
