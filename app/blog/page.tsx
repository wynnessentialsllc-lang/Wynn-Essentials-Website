import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { blogPosts } from "../../db/schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Wynn Essentials Insights — Textured-Hair Education",
  description: "Routine guides, ingredient education, and protective-style care for textured hair — from Wynn Essentials, in partnership with Hair Wellness Lab.",
  alternates: { canonical: "/blog" },
  openGraph: { title: "Wynn Essentials Insights — Textured-Hair Education", description: "Routine guides, ingredient education, and protective-style care for textured hair.", url: "/blog", siteName: "Wynn Essentials", type: "website" },
};

const when = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(d) : "");

export default async function BlogIndex() {
  let posts: (typeof blogPosts.$inferSelect)[] = [];
  try {
    posts = await getDb().select().from(blogPosts).where(eq(blogPosts.status, "published")).orderBy(desc(blogPosts.publishedAt)).limit(60);
  } catch { posts = []; }

  return (
    <div className="collection">
      <header className="collection-bar">
        <Link className="pdp-logo" href="/">WYNN ESSENTIALS<span>Healthy Hair Is a Practice</span></Link>
        <Link className="pdp-bar-shop" href="/#shop">Shop all products</Link>
      </header>

      <nav className="pdp-crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link> <span aria-hidden="true">/</span> <span aria-current="page">Insights</span>
      </nav>

      <section className="collection-hero">
        <p className="eyebrow">WYNN ESSENTIALS INSIGHTS</p>
        <h1>Good hair information, shared.</h1>
        <p>Routine guides, ingredient education, and protective-style care for textured hair — in partnership with Hair Wellness Lab.</p>
      </section>

      {posts.length === 0 ? (
        <p style={{ opacity: 0.7, marginBottom: "3rem" }}>New articles are on the way — check back soon.</p>
      ) : (
        <section className="blog-grid" aria-label="Articles">
          {posts.map(p => (
            <article className="blog-card" key={p.slug}>
              <Link href={`/blog/${p.slug}`} className="blog-card-art" aria-label={p.title}>
                {p.coverImage ? <img src={p.coverImage} alt="" width={1200} height={800} loading="lazy" /> : <span className="blog-card-fallback" aria-hidden="true" />}
              </Link>
              <div className="blog-card-body">
                <p className="eyebrow">{p.author}</p>
                <h2><Link href={`/blog/${p.slug}`}>{p.title}</Link></h2>
                {p.excerpt && <p className="blog-excerpt">{p.excerpt}</p>}
                <p className="blog-date">{when(p.publishedAt)}</p>
              </div>
            </article>
          ))}
        </section>
      )}

      <footer className="pdp-footer">
        <p><Link href="/#shop">Browse all products</Link> · <Link href="/#routine-finder">Find your routine</Link> · <Link href="/">Back to home</Link></p>
        <small>© {new Date().getFullYear()} Wynn Essentials. All rights reserved.</small>
      </footer>
    </div>
  );
}
