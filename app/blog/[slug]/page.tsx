import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { blogPosts, type BlogPost } from "../../../db/schema";
import { SITE_URL } from "../../seo";
import { renderMarkdown } from "../../../lib/markdown";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getPost(slug: string): Promise<BlogPost | null> {
  try {
    const [post] = await getDb().select().from(blogPosts).where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published"))).limit(1);
    return post ?? null;
  } catch { return null; }
}

const clip = (t: string, max = 155) => (t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Article not found | Wynn Essentials", robots: { index: false, follow: false } };
  const description = clip(post.excerpt || post.body.replace(/[#>*`_\-]/g, ""));
  return {
    title: `${post.title} | The Wynn Journal`,
    description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: { title: post.title, description, url: `/blog/${slug}`, siteName: "Wynn Essentials", type: "article", ...(post.coverImage ? { images: [{ url: post.coverImage }] } : {}) },
    twitter: { card: "summary_large_image", title: post.title, description, ...(post.coverImage ? { images: [post.coverImage] } : {}) },
  };
}

const when = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(d) : "");

export default async function BlogArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    ...(post.excerpt ? { description: post.excerpt } : {}),
    ...(post.coverImage ? { image: post.coverImage } : {}),
    author: { "@type": "Organization", name: post.author },
    publisher: { "@type": "Organization", name: "Wynn Essentials", url: SITE_URL },
    ...(post.publishedAt ? { datePublished: new Date(post.publishedAt).toISOString() } : {}),
    ...(post.updatedAt ? { dateModified: new Date(post.updatedAt).toISOString() } : {}),
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
  };

  return (
    <div className="collection">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />

      <header className="collection-bar">
        <Link className="pdp-logo" href="/">WYNN ESSENTIALS<span>Healthy Hair Is a Practice</span></Link>
        <Link className="pdp-bar-shop" href="/#shop">Shop all products</Link>
      </header>

      <nav className="pdp-crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link> <span aria-hidden="true">/</span> <Link href="/blog">Journal</Link> <span aria-hidden="true">/</span> <span aria-current="page">{post.title}</span>
      </nav>

      <article className="article">
        <p className="eyebrow">{post.author}{post.author !== "Wynn Essentials" ? " · in partnership with Wynn Essentials" : ""}</p>
        <h1>{post.title}</h1>
        <p className="article-date">{when(post.publishedAt)}</p>
        {post.coverImage && <img className="article-cover" src={post.coverImage} alt="" width={1600} height={900} />}
        <div className="article-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }} />
        <div className="article-cta">
          <p>Ready to put it into practice?</p>
          <Link className="button" href="/#shop">Shop the Essentials</Link>
        </div>
      </article>

      <footer className="pdp-footer">
        <p><Link href="/blog">← More from the Journal</Link> · <Link href="/#shop">Shop all products</Link></p>
        <small>© {new Date().getFullYear()} Wynn Essentials. All rights reserved.</small>
      </footer>
    </div>
  );
}
