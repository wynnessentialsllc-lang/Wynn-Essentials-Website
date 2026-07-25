import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "../../../db";
import { productInventory } from "../../../db/schema";
import { products } from "../../data";
import { isAuthenticated, adminTokenConfigured } from "../../../lib/admin-auth";
import { signOut } from "../orders/actions";
import { setSoldOut } from "./actions";
import SignInForm from "../orders/SignInForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Inventory — Wynn Essentials",
  robots: { index: false, follow: false, nocache: true },
};

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="order-page" style={{ maxWidth: "60rem" }}>{children}</main>;
}

export default async function AdminInventory() {
  if (!adminTokenConfigured()) {
    return <Shell><p className="eyebrow">INVENTORY</p><h1>Inventory is not configured.</h1><p>Set <code>ADMIN_ORDERS_TOKEN</code> in the Vercel environment to open this page.</p></Shell>;
  }
  if (!(await isAuthenticated())) return <Shell><SignInForm /></Shell>;

  // Current live overrides (slug -> soldOut). Empty if the table is not created
  // yet, in which case the catalog's own soldOut flag is the effective value.
  let override = new Map<string, boolean>();
  let tableMissing = false;
  try {
    const rows = await getDb().select().from(productInventory);
    override = new Map(rows.map(r => [r.slug, r.soldOut]));
  } catch {
    tableMissing = true;
  }

  const rows = products.map(p => ({ slug: p.slug, name: p.name, subtitle: p.subtitle, soldOut: override.has(p.slug) ? override.get(p.slug)! : Boolean(p.soldOut) }));
  const outCount = rows.filter(r => r.soldOut).length;

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <div><p className="eyebrow">INVENTORY</p><h1>Inventory</h1></div>
        <form action={signOut}><button className="outline-button" type="submit">Sign out</button></form>
      </div>
      <p style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Link href="/admin/orders">Orders</Link><Link href="/admin/subscribers">Subscribers</Link>
      </p>
      {tableMissing && <p role="alert" style={{ background: "#faf0e6", padding: "0.8rem 1rem", borderRadius: 4 }}>The inventory table isn’t set up yet, so toggling won’t save. Run the <code>product_inventory</code> migration first (see the note from your developer). Products below still reflect the built-in catalog status.</p>}
      <p>{outCount === 0 ? "Everything is in stock." : `${outCount} product${outCount === 1 ? "" : "s"} marked sold out.`}</p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
          <thead><tr>{["Product", "Status", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "0.6rem 0.5rem", borderBottom: "2px solid currentColor" }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.slug} style={{ borderBottom: "1px solid rgba(128,128,128,0.3)" }}>
                <td style={{ padding: "0.7rem 0.5rem" }}><strong>{r.name}</strong> <span style={{ opacity: 0.7 }}>{r.subtitle}</span></td>
                <td style={{ padding: "0.7rem 0.5rem", whiteSpace: "nowrap" }}>{r.soldOut ? <span style={{ color: "#b45309", fontWeight: 700 }}>Sold Out</span> : <span style={{ color: "#15803d" }}>In Stock</span>}</td>
                <td style={{ padding: "0.7rem 0.5rem", textAlign: "right" }}>
                  <form action={setSoldOut}>
                    <input type="hidden" name="slug" value={r.slug} />
                    <input type="hidden" name="soldOut" value={r.soldOut ? "false" : "true"} />
                    <button className="outline-button" type="submit">{r.soldOut ? "Mark In Stock" : "Mark Sold Out"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
