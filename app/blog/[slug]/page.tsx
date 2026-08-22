import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { blogPosts, type BlogPost } from "../../../db/schema";
import { SITE_URL, abs, ldJson } from "../../seo";
import { renderMarkdown } from "../../../lib/markdown";
import { scheduledInsightBySlug, type ScheduledInsight } from "../../../lib/scheduled-insights";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getPost(slug: string): Promise<BlogPost | ScheduledInsight | null> {
  const scheduled = scheduledInsightBySlug(slug);
  if (scheduled) return scheduled;
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
  // Short brand suffix on purpose: Google truncates a title around 60
  // characters, and "Insights" was spending nine of them on a section name no
  // one searches for. The post title gets the room instead.
  return {
    title: `${post.title} | Wynn Essentials`,
    description,
    keywords: "keywords" in post ? post.keywords : undefined,
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

  const url = `${SITE_URL}/blog/${post.slug}`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    ...(post.excerpt ? { description: post.excerpt } : {}),
    // Absolute, or crawlers silently drop it — the same rule the product and
    // organization schemas follow via abs().
    ...(post.coverImage ? { image: [abs(post.coverImage)] } : {}),
    author: { "@type": "Organization", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "Wynn Essentials",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: abs("/wynn-essentials-logo.jpeg") },
    },
    ...(post.publishedAt ? { datePublished: new Date(post.publishedAt).toISOString() } : {}),
    ...(post.updatedAt ? { dateModified: new Date(post.updatedAt).toISOString() } : {}),
    inLanguage: "en-US",
    wordCount: post.body.split(/\s+/).filter(Boolean).length,
    ...( "keywords" in post ? { keywords: post.keywords.join(", "), about: post.keywords.map(name => ({ "@type": "Thing", name })) } : {}),
    isPartOf: { "@type": "Blog", name: "Wynn Essentials Insights", url: `${SITE_URL}/blog` },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };

  const faqSchema = "faqs" in post ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: post.faqs.map(faq => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  } : null;

  // The page already renders this trail visually; emitting it as data is what
  // puts "Home › Insights › Title" in the search result instead of a raw URL.
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Insights", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  return (
    <div className="collection">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(articleSchema) }} />
      {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(faqSchema) }} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbSchema) }} />

      <header className="collection-bar">
        <Link className="pdp-logo" href="/">WYNN ESSENTIALS<span>Healthy Hair Is a Practice</span></Link>
        <Link className="pdp-bar-shop" href="/#shop">Shop all products</Link>
      </header>

      <nav className="pdp-crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link> <span aria-hidden="true">/</span> <Link href="/blog">Insights</Link> <span aria-hidden="true">/</span> <span aria-current="page">{post.title}</span>
      </nav>

      <main id="main">
      <article className="article">
        <p className="eyebrow">{post.author}{post.author !== "Wynn Essentials" ? " · in partnership with Wynn Essentials" : ""}</p>
        <h1>{post.title}</h1>
        <p className="article-date">{when(post.publishedAt)}</p>
        {post.coverImage && <img className="article-cover" src={post.coverImage} alt={post.title} width={1600} height={900} />}
        <div className="article-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }} />
        <div className="article-cta">
          <p>Ready to put it into practice?</p>
          <Link className="button" href="/#shop">Shop the Essentials</Link>
        </div>
      </article>
      </main>

      <footer className="pdp-footer">
        <p><Link href="/blog">← More Insights</Link> · <Link href="/#shop">Shop all products</Link></p>
        <small>© {new Date().getFullYear()} Wynn Essentials. All rights reserved.</small>
      </footer>
    </div>
  );
}
