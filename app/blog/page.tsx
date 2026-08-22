import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, lte } from "drizzle-orm";
import { getDb } from "../../db";
import { blogPosts } from "../../db/schema";
import { SITE_URL, abs, ldJson } from "../seo";
import { liveScheduledInsights } from "../../lib/scheduled-insights";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Wynn Essentials Insights — Textured-Hair Education",
  description: "Routine guides, ingredient education, and protective-style care for textured hair — from Wynn Essentials, in partnership with Hair Wellness Lab.",
  alternates: { canonical: "/blog" },
  openGraph: { title: "Wynn Essentials Insights — Textured-Hair Education", description: "Routine guides, ingredient education, and protective-style care for textured hair.", url: "/blog", siteName: "Wynn Essentials", type: "website", images: [{ url: "/og-basket-espresso.jpg", width: 1200, height: 630, alt: "Wynn Essentials textured-hair essentials" }] },
  twitter: { card: "summary_large_image", title: "Wynn Essentials Insights — Textured-Hair Education", description: "Routine guides, ingredient education, and protective-style care for textured hair.", images: ["/og-basket-espresso.jpg"] },
};

const when = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(d) : "");

export default async function BlogIndex() {
  const scheduled = liveScheduledInsights();
  let stored: (typeof blogPosts.$inferSelect)[] = [];
  try {
    stored = await getDb().select().from(blogPosts).where(and(eq(blogPosts.status, "published"), lte(blogPosts.publishedAt, new Date()))).orderBy(desc(blogPosts.publishedAt)).limit(60);
  } catch { stored = []; }
  const scheduledSlugs = new Set(scheduled.map(post => post.slug));
  const posts = [...scheduled, ...stored.filter(post => !scheduledSlugs.has(post.slug))]
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, 100);

  // Names the hub as a Blog and lists what is on it, so a crawler sees an
  // article index rather than an anonymous grid of links. Built from the same
  // rows the page renders, so it can never claim a post that is not published.
  const blogSchema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Wynn Essentials Insights",
    description: "Routine guides, ingredient education, and protective-style care for textured hair — from Wynn Essentials, in partnership with Hair Wellness Lab.",
    url: `${SITE_URL}/blog`,
    inLanguage: "en-US",
    publisher: { "@type": "Organization", name: "Wynn Essentials", url: SITE_URL },
    blogPost: posts.map(p => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${SITE_URL}/blog/${p.slug}`,
      ...(p.excerpt ? { description: p.excerpt } : {}),
      ...(p.coverImage ? { image: [abs(p.coverImage)] } : {}),
      author: { "@type": "Organization", name: p.author },
      ...(p.publishedAt ? { datePublished: new Date(p.publishedAt).toISOString() } : {}),
    })),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Insights", item: `${SITE_URL}/blog` },
    ],
  };

  return (
    <div className="collection">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(blogSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbSchema) }} />

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
