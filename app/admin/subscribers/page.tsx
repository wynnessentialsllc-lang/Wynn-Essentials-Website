import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { campaignDeliveries, emailCampaigns, subscribers as subscribersTable } from "../../../db/schema";
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
  let campaigns: (typeof emailCampaigns.$inferSelect)[] = [];
  let deliveries: (typeof campaignDeliveries.$inferSelect)[] = [];
  let error: string | null = null;
  try {
    const db = getDb();
    [rows, campaigns, deliveries] = await Promise.all([
      db.select().from(subscribersTable).orderBy(desc(subscribersTable.createdAt)).limit(500),
      db.select().from(emailCampaigns).orderBy(desc(emailCampaigns.scheduledAt)).limit(100),
      db.select().from(campaignDeliveries).limit(50000),
    ]);
  } catch (cause) {
    // Drizzle wraps the driver error: the outer `.message` is only the generic
    // "Failed query: …" SQL dump, while the real reason (e.g. a column missing
    // because a migration has not been applied to this database) lives on the
    // underlying `.cause`. Surface that so the admin sees an actionable message.
    const root = cause instanceof Error && cause.cause instanceof Error ? cause.cause : cause;
    error = root instanceof Error ? root.message : "Unknown error";
  }

  const consented = rows.filter(r => r.marketingConsent && !r.unsubscribedAt).length;
  const unsubscribed = rows.filter(r => !!r.unsubscribedAt).length;
  const campaignRows = campaigns.map(campaign => {
    const sent = deliveries.filter(d => d.campaignId === campaign.id && !!d.sentAt);
    return {
      ...campaign,
      sent: sent.length,
      opened: sent.filter(d => !!d.openedAt).length,
      unopened: sent.filter(d => !d.openedAt && !d.bouncedAt).length,
      bounced: sent.filter(d => !!d.bouncedAt).length,
      unsubscribed: sent.filter(d => !!d.unsubscribedAt).length,
    };
  });

  const metric = { padding: "18px", border: "1px solid var(--line)", background: "var(--soft)" } as const;
  const cell = { padding: "0.75rem 0.6rem", borderBottom: "1px solid rgba(128,128,128,0.25)", verticalAlign: "top" } as const;

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
          <p>{rows.length === 0 ? "No subscribers yet." : `${rows.length} subscriber${rows.length === 1 ? "" : "s"} on file.`}</p>

          <section aria-labelledby="subscriber-health" style={{ margin: "38px 0 64px" }}>
            <h2 id="subscriber-health" style={{ fontSize: "clamp(34px,5vw,56px)", marginBottom: "20px" }}>List health</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "12px" }}>
              <div style={metric}><span className="eyebrow">ACTIVE</span><strong style={{ display: "block", fontSize: "34px", marginTop: "8px" }}>{consented}</strong></div>
              <div style={metric}><span className="eyebrow">UNSUBSCRIBED</span><strong style={{ display: "block", fontSize: "34px", marginTop: "8px" }}>{unsubscribed}</strong></div>
              <div style={metric}><span className="eyebrow">TOTAL ON FILE</span><strong style={{ display: "block", fontSize: "34px", marginTop: "8px" }}>{rows.length}</strong></div>
            </div>
          </section>

          <section aria-labelledby="campaign-history" style={{ marginBottom: "72px" }}>
            <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: "20px", flexWrap: "wrap", marginBottom: "18px" }}>
              <div><p className="eyebrow">CAMPAIGN REPORTING</p><h2 id="campaign-history" style={{ fontSize: "clamp(38px,6vw,66px)", marginTop: "8px" }}>Email campaigns</h2></div>
              <small style={{ maxWidth: "390px", lineHeight: 1.6, color: "var(--muted)" }}>Open status depends on image loading and may be undercounted by privacy-protected inboxes. Bounces and unsubscribes remain definitive.</small>
            </div>
            {campaignRows.length === 0 ? (
              <div style={{ ...metric, padding: "28px" }}><strong>No campaigns sent yet.</strong><p style={{ marginBottom: 0 }}>Scheduled campaigns will appear here with delivery results after sending begins.</p></div>
            ) : (
              <div style={{ overflowX: "auto", borderTop: "2px solid currentColor" }}>
                <table style={{ width: "100%", minWidth: "900px", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                  <thead><tr>{["Campaign", "Status", "Scheduled / sent", "Sent", "Opened", "Unopened", "Kicked back", "Unsubscribed"].map(h => <th key={h} style={{ ...cell, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                  <tbody>{campaignRows.map(c => <tr key={c.id}>
                    <td style={cell}><strong>{c.name}</strong><small style={{ display: "block", color: "var(--muted)", marginTop: "4px" }}>{c.subject}</small></td>
                    <td style={{ ...cell, textTransform: "capitalize", fontWeight: 800 }}>{c.status}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>{when(c.sentAt || c.scheduledAt)}</td>
                    <td style={cell}>{c.sent}</td><td style={cell}>{c.opened}</td><td style={cell}>{c.unopened}</td><td style={cell}>{c.bounced}</td><td style={cell}>{c.unsubscribed}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            )}
            {!process.env.RESEND_WEBHOOK_SECRET && <p className="config-warning" style={{ marginTop: "18px" }}>Open and bounce tracking will begin after <code>RESEND_WEBHOOK_SECRET</code> is connected in Vercel and the Resend webhook points to <code>/api/webhooks/resend</code>.</p>}
          </section>

          <section aria-labelledby="subscriber-list">
          <p className="eyebrow">AUDIENCE</p>
          <h2 id="subscriber-list" style={{ fontSize: "clamp(38px,6vw,66px)", margin: "8px 0 20px" }}>Subscribers</h2>

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
                    <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>{row.unsubscribedAt ? "Unsubscribed" : row.marketingConsent ? "Yes" : "No"}</td>
                    <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>{row.source || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </section>
        </>
      )}
    </Shell>
  );
}
