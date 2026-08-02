import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { blogPosts } from "../../../db/schema";
import { isAuthenticated, adminTokenConfigured } from "../../../lib/admin-auth";
import { signOut } from "../orders/actions";
import SignInForm from "../orders/SignInForm";
import { savePost, deletePost } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Insights — Wynn Essentials",
  robots: { index: false, follow: false, nocache: true },
};

const when = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(d) : "—");
const input: React.CSSProperties = { width: "100%", padding: "0.55rem 0.7rem", border: "1px solid var(--line)", borderRadius: 4, font: "inherit" };
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, margin: "0.9rem 0 0.3rem" };

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="order-page" style={{ maxWidth: "60rem" }}>{children}</main>;
}

export default async function AdminBlog({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  if (!adminTokenConfigured()) return <Shell><p className="eyebrow">INSIGHTS</p><h1>Insights is not configured.</h1><p>Set <code>ADMIN_ORDERS_TOKEN</code> in Vercel to open this page.</p></Shell>;
  if (!(await isAuthenticated())) return <Shell><SignInForm /></Shell>;

  const { edit } = await searchParams;
  let posts: (typeof blogPosts.$inferSelect)[] = [];
  let error: string | null = null;
  try { posts = await getDb().select().from(blogPosts).orderBy(desc(blogPosts.updatedAt)).limit(200); }
  catch (e) { error = e instanceof Error ? e.message : "Unknown error"; }

  const editing = edit ? posts.find(p => p.slug === edit) : undefined;

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <div><p className="eyebrow">EDUCATION HUB</p><h1>Insights</h1></div>
        <form action={signOut}><button className="outline-button" type="submit">Sign out</button></form>
      </div>
      <p style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}><Link href="/admin">← Admin home</Link><Link href="/blog" target="_blank">View live Insights ↗</Link></p>

      {error && <p role="alert" style={{ background: "#faf0e6", padding: "0.8rem 1rem", borderRadius: 4 }}>Could not read posts: {error}. If the table isn’t set up yet, run the <code>blog_posts</code> migration first.</p>}

      <section style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "1.25rem 1.4rem", margin: "1rem 0 2rem" }}>
        <h2 style={{ fontSize: "1.2rem", margin: "0 0 0.25rem" }}>{editing ? `Edit: ${editing.title}` : "Write a new post"}</h2>
        <p style={{ opacity: 0.7, marginTop: 0, fontSize: 13 }}>Body uses simple Markdown: <code>## Heading</code>, <code>**bold**</code>, <code>- list</code>, <code>[link](https://…)</code>, <code>![image](https://…)</code>.</p>
        <form action={savePost}>
          {editing && <input type="hidden" name="originalSlug" value={editing.slug} />}
          <label style={label}>Title<input style={input} name="title" required defaultValue={editing?.title ?? ""} /></label>
          {!editing && <label style={label}>URL slug (optional — auto from title)<input style={input} name="slug" placeholder="e.g. boho-braid-care-guide" /></label>}
          <label style={label}>Author<input style={input} name="author" defaultValue={editing?.author ?? "Hair Wellness Lab"} /></label>
          <label style={label}>Cover image URL (optional)<input style={input} name="coverImage" defaultValue={editing?.coverImage ?? ""} placeholder="/editorial/… or https://…" /></label>
          <label style={label}>Excerpt (optional, shown on the index)<textarea style={{ ...input, minHeight: 60 }} name="excerpt" defaultValue={editing?.excerpt ?? ""} /></label>
          <label style={label}>Body (Markdown)<textarea style={{ ...input, minHeight: 320, fontFamily: "ui-monospace, monospace" }} name="body" required defaultValue={editing?.body ?? ""} /></label>
          <label style={label}>Status
            <select style={input} name="status" defaultValue={editing?.status ?? "draft"}>
              <option value="draft">Draft (only you can see it)</option>
              <option value="published">Published (live on /blog)</option>
            </select>
          </label>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
            <button className="button" type="submit">{editing ? "Save changes" : "Create post"}</button>
            {editing && <Link className="outline-button" href="/admin/blog">Cancel edit</Link>}
          </div>
        </form>
      </section>

      <h2 style={{ fontSize: "1.2rem", margin: "0 0 0.6rem" }}>All posts ({posts.length})</h2>
      {posts.length === 0 ? <p style={{ opacity: 0.7 }}>No posts yet.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead><tr>{["Title", "Author", "Status", "Published", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "0.5rem", borderBottom: "2px solid currentColor" }}>{h}</th>)}</tr></thead>
            <tbody>{posts.map(p => (
              <tr key={p.slug} style={{ borderBottom: "1px solid rgba(128,128,128,0.25)" }}>
                <td style={{ padding: "0.5rem" }}>{p.title}</td>
                <td style={{ padding: "0.5rem" }}>{p.author}</td>
                <td style={{ padding: "0.5rem", color: p.status === "published" ? "#15803d" : "#b45309", fontWeight: 600 }}>{p.status}</td>
                <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>{when(p.publishedAt)}</td>
                <td style={{ padding: "0.5rem", whiteSpace: "nowrap", display: "flex", gap: "0.5rem" }}>
                  <Link href={`/admin/blog?edit=${p.slug}`}>Edit</Link>
                  <form action={deletePost}><input type="hidden" name="slug" value={p.slug} /><button type="submit" style={{ border: "none", background: "none", color: "#b91c1c", cursor: "pointer", textDecoration: "underline", font: "inherit" }}>Delete</button></form>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
