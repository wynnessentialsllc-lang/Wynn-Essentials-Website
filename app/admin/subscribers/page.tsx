import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { subscribers as subscribersTable } from "../../../db/schema";
import { isAuthenticated, adminTokenConfigured } from "../../../lib/admin-auth";
import { signOut } from "../orders/actions";
import SignInForm from "../orders/SignInForm";

// Subscriber rows hold contact PII (email, phone), so this view must never be
// cached, prerendered, or indexed — same posture as the orders view.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Subscribers — Wynn Essentials",
  robots: { index: false, follow: false, nocache: true },
};

const when = (value: Date | null) =>
  value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—";

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="order-page" style={{ maxWidth: "72rem" }}>{children}</main>;
}

export default async function AdminSubscribers() {
  if (!adminTokenConfigured()) {
    return (
      <Shell>
        <p className="eyebrow">THE WYNN EDIT</p>
        <h1>Subscriber view is not configured.</h1>
        <p>
          Set <code>ADMIN_ORDERS_TOKEN</code> to a random value of at least 16 characters in the
          Vercel environment, then reload. Until it is set this page stays closed, because these
          records contain customer email and phone details.
        </p>
      </Shell>
    );
  }

  if (!(await isAuthenticated())) return <Shell><SignInForm /></Shell>;

  let rows: (typeof subscribersTable.$inferSelect)[] = [];
  let error: string | null = null;
  try {
    rows = await getDb().select().from(subscribersTable).orderBy(desc(subscribersTable.createdAt)).limit(500);
  } catch (cause) {
    // Drizzle wraps the driver error: the outer `.message` is only the generic
    // "Failed query: …" SQL dump, while the real reason (e.g. a column missing
    // because a migration has not been applied to this database) lives on the
    // underlying `.cause`. Surface that so the admin sees an actionable message.
    const root = cause instanceof Error && cause.cause instanceof Error ? cause.cause : cause;
    error = root instanceof Error ? root.message : "Unknown error";
  }

  const consented = rows.filter(r => r.marketingConsent).length;

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <p className="eyebrow">THE WYNN EDIT</p>
          <h1>Subscribers</h1>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <Link className="outline-button" href="/admin/orders">Orders</Link>
          <form action={signOut}><button className="outline-button" type="submit">Sign out</button></form>
        </div>
      </div>

      {error ? (
        <p role="alert">Could not read subscribers: {error}</p>
      ) : (
        <>
          <p>{rows.length === 0 ? "No subscribers yet." : `${rows.length} subscriber${rows.length === 1 ? "" : "s"}, ${consented} with marketing consent on record.`}</p>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr>
                  {["Joined", "Email", "Phone", "Consent", "Source"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "0.6rem 0.5rem", borderBottom: "2px solid currentColor", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.email} style={{ borderBottom: "1px solid rgba(128,128,128,0.35)", verticalAlign: "top" }}>
                    <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>{when(row.createdAt)}</td>
                    <td style={{ padding: "0.6rem 0.5rem" }}><a href={`mailto:${row.email}`}>{row.email}</a></td>
                    <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>{row.phone || "—"}</td>
                    <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>{row.marketingConsent ? "Yes" : "No"}</td>
                    <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>{row.source || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
