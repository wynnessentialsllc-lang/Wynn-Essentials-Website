import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { productInventory, productWaitlist, subscribers } from "../../../db/schema";
import { products } from "../../data";
import { isAuthenticated, adminTokenConfigured } from "../../../lib/admin-auth";
import { signOut } from "../orders/actions";
import SignInForm from "../orders/SignInForm";
import { notifyWaitlist, removeFromWaitlist } from "./actions";
import { isSoldOut, waitlistProductName } from "../../../lib/restock-waitlist";

// Waitlist rows are subscriber email addresses — PII, same posture as the
// orders and subscribers views: never cached, prerendered, or indexed.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Waitlist — Wynn Essentials",
  robots: { index: false, follow: false, nocache: true },
};

const when = (value: Date | null) =>
  value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—";

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="order-page" style={{ maxWidth: "72rem" }}>{children}</main>;
}

const cell = { padding: "0.6rem 0.5rem" } as const;
const headCell = { textAlign: "left", padding: "0.6rem 0.5rem", borderBottom: "2px solid currentColor", whiteSpace: "nowrap" } as const;

type Entry = { email: string; joinedAt: Date | null; notifiedAt: Date | null; marketingConsent: boolean };
type Group = {
  slug: string;
  name: string;
  inCatalog: boolean;
  soldOut: boolean;
  stock: number | null;
  waiting: Entry[];
  notified: Entry[];
};

export default async function AdminWaitlist() {
  if (!adminTokenConfigured()) {
    return (
      <Shell>
        <p className="eyebrow">WAITLIST</p>
        <h1>Waitlist view is not configured.</h1>
        <p>
          Set <code>ADMIN_ORDERS_TOKEN</code> to a random value of at least 16 characters in the
          Vercel environment, then reload. Until it is set this page stays closed, because these
          records are customer email addresses.
        </p>
      </Shell>
    );
  }
  if (!(await isAuthenticated())) return <Shell><SignInForm /></Shell>;

  let rows: { email: string; slug: string; joinedAt: Date | null; notifiedAt: Date | null }[] = [];
  let stockBySlug = new Map<string, { soldOut: boolean; stock: number | null }>();
  let consentByEmail = new Map<string, boolean>();
  let error: string | null = null;
  try {
    const db = getDb();
    const [signups, inventory, contacts] = await Promise.all([
      db.select().from(productWaitlist).orderBy(desc(productWaitlist.joinedAt)).limit(5000),
      db.select().from(productInventory),
      // Marketing standing is a property of the contact, not of a membership,
      // so it is read once per address rather than joined per row.
      db.select({ email: subscribers.email, marketingConsent: subscribers.marketingConsent }).from(subscribers).limit(20000),
    ]);
    rows = signups;
    stockBySlug = new Map(inventory.map(r => [r.slug, { soldOut: r.soldOut, stock: r.stock }]));
    consentByEmail = new Map(contacts.map(c => [c.email, c.marketingConsent]));
  } catch (cause) {
    // Drizzle's outer message is only the "Failed query: …" SQL dump; the real
    // reason (an unapplied migration, say) is on `.cause`. Surface that one.
    const root = cause instanceof Error && cause.cause instanceof Error ? cause.cause : cause;
    error = root instanceof Error ? root.message : "Unknown error";
  }

  // Group by product. Every product that has ever had a signup gets a group,
  // including one that has since left the catalog — those addresses are still
  // owed an answer, so they must stay visible rather than vanish with the row.
  const groups = new Map<string, Group>();
  const groupFor = (slug: string): Group => {
    let group = groups.get(slug);
    if (!group) {
      const product = products.find(p => p.slug === slug);
      const override = stockBySlug.get(slug);
      const stock = override?.stock ?? null;
      group = {
        slug,
        name: waitlistProductName(slug),
        inCatalog: Boolean(product),
        soldOut: isSoldOut({ soldOut: override?.soldOut ?? Boolean(product?.soldOut), stock }),
        stock,
        waiting: [],
        notified: [],
      };
      groups.set(slug, group);
    }
    return group;
  };

  for (const row of rows) {
    const entry: Entry = {
      email: row.email,
      joinedAt: row.joinedAt,
      notifiedAt: row.notifiedAt,
      marketingConsent: consentByEmail.get(row.email) ?? false,
    };
    groupFor(row.slug)[row.notifiedAt ? "notified" : "waiting"].push(entry);
  }

  // Products people are actually waiting on come first, biggest list at the
  // top — that is the order the decision gets made in.
  const ordered = [...groups.values()].sort((a, b) => b.waiting.length - a.waiting.length || a.name.localeCompare(b.name));
  const totalWaiting = ordered.reduce((sum, g) => sum + g.waiting.length, 0);
  const readyToNotify = ordered.filter(g => g.waiting.length > 0 && !g.soldOut);

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <div><p className="eyebrow">WAITLIST</p><h1>Restock waitlist</h1></div>
        <form action={signOut}><button className="outline-button" type="submit">Sign out</button></form>
      </div>
      <p style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Link href="/admin">← Admin home</Link>
        <Link href="/admin/inventory">Inventory</Link>
        <Link href="/admin/subscribers">Subscribers</Link>
      </p>

      {error ? (
        <p role="alert">Could not read the waitlist: {error}</p>
      ) : (
        <>
          <p style={{ opacity: 0.85 }}>
            Everyone who asked to hear when a sold-out product returns. They are emailed a
            confirmation the moment they join, and the back-in-stock email sends itself when you
            restock the product in <Link href="/admin/inventory">Inventory</Link> — so on a normal
            restock there is nothing to do here. <strong>Notify now</strong> is the manual
            fallback for a product that was restocked without ever being marked sold out, or a
            send that needs repeating.
          </p>
          <p style={{ opacity: 0.85 }}>
            <strong>“Waitlist only” is not a problem.</strong> The back-in-stock email is a
            transactional alert she asked for by name, so it does not need marketing consent and
            goes to everyone on the list. The <em>Newsletter</em> column only records whether she
            also ticked the optional box to join The Wynn Edit — that one is marketing, and only
            an opt-in can grant it.
          </p>

          <p>
            {totalWaiting === 0
              ? "Nobody is waiting on a restock right now."
              : `${totalWaiting} ${totalWaiting === 1 ? "person is" : "people are"} waiting across ${ordered.filter(g => g.waiting.length > 0).length} product${ordered.filter(g => g.waiting.length > 0).length === 1 ? "" : "s"}.`}
            {readyToNotify.length > 0 && (
              <> <strong>{readyToNotify.length} {readyToNotify.length === 1 ? "product is" : "products are"} back in stock with people still waiting to be told.</strong></>
            )}
          </p>

          {ordered.map(group => (
            <section key={group.slug} style={{ marginTop: "2rem", border: "1px solid var(--line)", borderRadius: 4, padding: "1.25rem 1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <strong style={{ fontSize: "1.1rem" }}>{group.name}</strong>{" "}
                  {group.soldOut
                    ? <span style={{ color: "#b45309", fontWeight: 700 }}>Sold Out</span>
                    : <span style={{ color: "#15803d" }}>{group.stock != null ? `${group.stock} in stock` : "In Stock"}</span>}
                  {!group.inCatalog && <span style={{ opacity: 0.7 }}> · no longer in the catalog</span>}
                  <div style={{ opacity: 0.75, marginTop: 4 }}>
                    {group.waiting.length} waiting · {group.notified.length} already notified
                  </div>
                </div>
                {group.waiting.length > 0 && group.inCatalog && (
                  <form action={notifyWaitlist}>
                    <input type="hidden" name="slug" value={group.slug} />
                    <button className="outline-button" type="submit" disabled={group.soldOut} style={{ minHeight: 40, padding: "8px 12px" }}>
                      Notify now ({group.waiting.length})
                    </button>
                  </form>
                )}
              </div>

              {group.soldOut && group.waiting.length > 0 && (
                <p style={{ opacity: 0.75, marginTop: "0.75rem" }}>
                  Still sold out, so there is nothing to announce yet. Set stock or clear the
                  sold-out flag in <Link href="/admin/inventory">Inventory</Link> and this list is
                  emailed automatically.
                </p>
              )}

              {group.waiting.length > 0 && (
                <div style={{ overflowX: "auto", marginTop: "1rem" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                    <thead><tr>{["Waiting since", "Email", "Newsletter", ""].map((h, i) => <th key={h || i} style={headCell}>{h}</th>)}</tr></thead>
                    <tbody>
                      {group.waiting.map(entry => (
                        <tr key={entry.email} style={{ borderBottom: "1px solid rgba(128,128,128,0.35)" }}>
                          <td style={{ ...cell, whiteSpace: "nowrap" }}>{when(entry.joinedAt)}</td>
                          <td style={cell}><a href={`mailto:${entry.email}`}>{entry.email}</a></td>
                          <td style={{ ...cell, whiteSpace: "nowrap" }} title={entry.marketingConsent ? "Also opted in to The Wynn Edit." : "Waitlist only — still gets the back-in-stock email."}>
                            {entry.marketingConsent ? "Opted in" : <span style={{ opacity: 0.7 }}>Waitlist only</span>}
                          </td>
                          <td style={{ ...cell, textAlign: "right" }}>
                            <form action={removeFromWaitlist}>
                              <input type="hidden" name="slug" value={group.slug} />
                              <input type="hidden" name="email" value={entry.email} />
                              <button className="outline-button" type="submit" style={{ minHeight: 36, padding: "6px 10px" }}>Remove</button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {group.waiting.length > 0 && (
                <details style={{ marginTop: "0.75rem" }}>
                  <summary style={{ cursor: "pointer" }}>Copy these {group.waiting.length} address{group.waiting.length === 1 ? "" : "es"}</summary>
                  <textarea
                    readOnly
                    rows={3}
                    aria-label={`${group.name} waitlist addresses`}
                    value={group.waiting.map(e => e.email).join(", ")}
                    style={{ width: "100%", marginTop: "0.5rem", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 4, fontFamily: "inherit" }}
                  />
                </details>
              )}

              {group.notified.length > 0 && (
                <details style={{ marginTop: "0.75rem" }}>
                  <summary style={{ cursor: "pointer" }}>{group.notified.length} already told it was back</summary>
                  <ul style={{ marginTop: "0.5rem", opacity: 0.8 }}>
                    {group.notified.map(entry => (
                      <li key={entry.email}>{entry.email} <span style={{ opacity: 0.7 }}>— notified {when(entry.notifiedAt)}</span></li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          ))}
        </>
      )}
    </Shell>
  );
}
