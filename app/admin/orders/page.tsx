import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { orders as ordersTable } from "../../../db/schema";
import { isAuthenticated, adminTokenConfigured } from "../../../lib/admin-auth";
import { trackingUrl } from "../../../lib/notify";
import { signOut, setFulfillment, setShipped } from "./actions";
import SignInForm from "./SignInForm";

// Carriers offered in the "Mark shipped" picker. Kept here (not imported from
// the "use server" actions module, which may only export async functions).
const CARRIERS = ["USPS", "UPS", "FedEx", "DHL", "Other"] as const;

// Customer data must never be cached or prerendered, and must never be indexed.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Orders — Wynn Essentials",
  robots: { index: false, follow: false, nocache: true },
};

type OrderItem = { name?: string | null; quantity?: number | null; unitAmount?: number | null };
type ShippingAddress = {
  name?: string | null;
  address?: { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null } | null;
};

const money = (cents: number | null, currency: string | null) =>
  cents == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "usd").toUpperCase() }).format(cents / 100);

const when = (value: Date | null) =>
  value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—";

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="order-page" style={{ maxWidth: "72rem" }}>{children}</main>;
}

export default async function AdminOrders() {
  if (!adminTokenConfigured()) {
    return (
      <Shell>
        <p className="eyebrow">FULFILLMENT</p>
        <h1>Order view is not configured.</h1>
        <p>
          Set <code>ADMIN_ORDERS_TOKEN</code> to a random value of at least 16 characters in the
          Vercel environment, then reload. Until it is set this page stays closed, because these
          records contain customer addresses.
        </p>
      </Shell>
    );
  }

  if (!(await isAuthenticated())) return <Shell><SignInForm /></Shell>;

  let rows: (typeof ordersTable.$inferSelect)[] = [];
  let error: string | null = null;
  try {
    rows = await getDb().select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(200);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Unknown error";
  }

  const unfulfilled = rows.filter(r => r.fulfillmentStatus !== "fulfilled" && r.status === "paid");

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <p className="eyebrow">FULFILLMENT</p>
          <h1>Orders</h1>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <Link className="outline-button" href="/admin/subscribers">Subscribers</Link>
          <form action={signOut}><button className="outline-button" type="submit">Sign out</button></form>
        </div>
      </div>

      {error ? (
        <p role="alert">Could not read orders: {error}</p>
      ) : (
        <>
          <p>{rows.length === 0 ? "No orders yet." : `${rows.length} order${rows.length === 1 ? "" : "s"}, ${unfulfilled.length} awaiting fulfillment.`}</p>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr>
                  {["Placed", "Reference", "Customer", "Ship to", "Items", "Total", "Payment", "Fulfillment"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "0.6rem 0.5rem", borderBottom: "2px solid currentColor", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const items = (Array.isArray(row.items) ? row.items : []) as OrderItem[];
                  const ship = (row.shippingAddress ?? null) as ShippingAddress | null;
                  const a = ship?.address;
                  return (
                    <tr key={row.sessionId} style={{ borderBottom: "1px solid rgba(128,128,128,0.35)", verticalAlign: "top" }}>
                      <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>{when(row.createdAt)}</td>
                      <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}><code>{row.orderReference || "—"}</code></td>
                      <td style={{ padding: "0.6rem 0.5rem" }}>
                        {row.customerName || "—"}
                        <br />
                        <span style={{ opacity: 0.75 }}>{row.customerEmail || "—"}</span>
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem" }}>
                        {a ? <>{ship?.name}<br />{a.line1}{a.line2 ? <>, {a.line2}</> : null}<br />{a.city}, {a.state} {a.postal_code}<br />{a.country}</> : "—"}
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem" }}>
                        {items.length === 0 ? "—" : items.map((item, i) => <div key={i}>{item.quantity}× {item.name}</div>)}
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>
                        {money(row.totalAmount, row.currency)}
                        {row.shippingAmount ? <div style={{ opacity: 0.75 }}>ship {money(row.shippingAmount, row.currency)}</div> : null}
                        {row.taxAmount ? <div style={{ opacity: 0.75 }}>tax {money(row.taxAmount, row.currency)}</div> : null}
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", whiteSpace: "nowrap" }}>
                        {row.status}
                        <div style={{ opacity: 0.75 }}>{row.paymentStatus}</div>
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", minWidth: "230px" }}>
                        {row.fulfillmentStatus === "fulfilled" && (
                          <div style={{ marginBottom: "0.5rem" }}>
                            <span style={{ color: "#15803d", fontWeight: 700 }}>✓ Fulfilled</span>
                            {row.trackingNumber && (
                              <div style={{ opacity: 0.8, fontSize: "0.8rem" }}>
                                {row.carrier ? `${row.carrier} · ` : ""}
                                {trackingUrl(row.carrier, row.trackingNumber)
                                  ? <a href={trackingUrl(row.carrier, row.trackingNumber)!} target="_blank" rel="noreferrer">{row.trackingNumber}</a>
                                  : row.trackingNumber}
                              </div>
                            )}
                          </div>
                        )}
                        <form action={setShipped} style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          <input type="hidden" name="sessionId" value={row.sessionId} />
                          <select name="carrier" defaultValue={row.carrier ?? "USPS"} style={{ padding: "0.35rem", border: "1px solid rgba(128,128,128,0.5)" }}>
                            {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input name="trackingNumber" defaultValue={row.trackingNumber ?? ""} placeholder="Tracking number" style={{ padding: "0.35rem", border: "1px solid rgba(128,128,128,0.5)" }} />
                          <button className="button" type="submit" style={{ minHeight: "auto", padding: "0.5rem 0.75rem", fontSize: "0.75rem" }}>
                            {row.fulfillmentStatus === "fulfilled" ? "Update & re-email" : "Mark shipped + email"}
                          </button>
                        </form>
                        <form action={setFulfillment} style={{ marginTop: "0.4rem" }}>
                          <input type="hidden" name="sessionId" value={row.sessionId} />
                          <input type="hidden" name="status" value={row.fulfillmentStatus === "fulfilled" ? "unfulfilled" : "fulfilled"} />
                          <button className="text-button" type="submit" style={{ fontSize: "0.78rem" }}>
                            {row.fulfillmentStatus === "fulfilled" ? "Mark unfulfilled" : "Mark fulfilled (no email)"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
