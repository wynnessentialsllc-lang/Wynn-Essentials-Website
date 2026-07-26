import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "../../../db";
import { productInventory } from "../../../db/schema";
import { products } from "../../data";
import { isAuthenticated, adminTokenConfigured } from "../../../lib/admin-auth";
import { signOut } from "../orders/actions";
import { setSoldOut, setStock } from "./actions";
import SignInForm from "../orders/SignInForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Inventory — Wynn Essentials",
  robots: { index: false, follow: false, nocache: true },
};

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="order-page" style={{ maxWidth: "64rem" }}>{children}</main>;
}

export default async function AdminInventory() {
  if (!adminTokenConfigured()) {
    return <Shell><p className="eyebrow">INVENTORY</p><h1>Inventory is not configured.</h1><p>Set <code>ADMIN_ORDERS_TOKEN</code> in the Vercel environment to open this page.</p></Shell>;
  }
  if (!(await isAuthenticated())) return <Shell><SignInForm /></Shell>;

  let override = new Map<string, { soldOut: boolean; stock: number | null }>();
  let tableMissing = false;
  try {
    const rows = await getDb().select().from(productInventory);
    override = new Map(rows.map(r => [r.slug, { soldOut: r.soldOut, stock: r.stock }]));
  } catch {
    tableMissing = true;
  }

  const rows = products.map(p => {
    const ov = override.get(p.slug);
    const stock = ov?.stock ?? null;
    const forced = ov?.soldOut ?? Boolean(p.soldOut);
    const soldOut = forced || (stock != null && stock <= 0);
    return { slug: p.slug, name: p.name, subtitle: p.subtitle, stock, forced, soldOut };
  });
  const outCount = rows.filter(r => r.soldOut).length;

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <div><p className="eyebrow">INVENTORY</p><h1>Inventory</h1></div>
        <form action={signOut}><button className="outline-button" type="submit">Sign out</button></form>
      </div>
      <p style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}><Link href="/admin">← Admin home</Link><Link href="/admin/orders">Orders</Link></p>
      {tableMissing && <p role="alert" style={{ background: "#faf0e6", padding: "0.8rem 1rem", borderRadius: 4 }}>The inventory table isn’t set up yet, so changes won’t save. Run the <code>product_inventory</code> migration first. Products below still reflect the built-in catalog status.</p>}
      <p style={{ opacity: 0.8 }}>Set a <strong>stock count</strong> to track units — it drops automatically with each sale and the product goes sold out at zero, so you can’t oversell. Leave stock blank to not track it. “Force sold out” hides a product regardless of stock.</p>
      <p>{outCount === 0 ? "Everything is available." : `${outCount} product${outCount === 1 ? "" : "s"} sold out.`}</p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
          <thead><tr>{["Product", "Stock", "Status", "Override"].map(h => <th key={h} style={{ textAlign: "left", padding: "0.6rem 0.5rem", borderBottom: "2px solid currentColor" }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.slug} style={{ borderBottom: "1px solid rgba(128,128,128,0.3)" }}>
                <td style={{ padding: "0.7rem 0.5rem" }}><strong>{r.name}</strong> <span style={{ opacity: 0.7 }}>{r.subtitle}</span></td>
                <td style={{ padding: "0.7rem 0.5rem" }}>
                  <form action={setStock} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="hidden" name="slug" value={r.slug} />
                    <input name="stock" type="number" min={0} step={1} defaultValue={r.stock ?? ""} placeholder="—" aria-label={`${r.name} stock`} style={{ width: 84, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 4 }} />
                    <button className="outline-button" type="submit" style={{ minHeight: 40, padding: "8px 12px" }}>Save</button>
                  </form>
                </td>
                <td style={{ padding: "0.7rem 0.5rem", whiteSpace: "nowrap" }}>
                  {r.soldOut ? <span style={{ color: "#b45309", fontWeight: 700 }}>Sold Out</span> : r.stock != null ? <span style={{ color: r.stock <= 3 ? "#b45309" : "#15803d" }}>{r.stock} in stock</span> : <span style={{ color: "#15803d" }}>In Stock</span>}
                </td>
                <td style={{ padding: "0.7rem 0.5rem" }}>
                  <form action={setSoldOut}>
                    <input type="hidden" name="slug" value={r.slug} />
                    <input type="hidden" name="soldOut" value={r.forced ? "false" : "true"} />
                    <button className="outline-button" type="submit" style={{ minHeight: 40, padding: "8px 12px" }}>{r.forced ? "Un-force" : "Force sold out"}</button>
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
