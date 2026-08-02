"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { blogPosts } from "../../../db/schema";
import { isAuthenticated } from "../../../lib/admin-auth";

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

const str = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Create or update a post. A new post's slug is derived from the title (or an
// explicit slug field); editing keeps the original slug via a hidden field.
export async function savePost(formData: FormData) {
  if (!(await isAuthenticated())) throw new Error("Not authorized.");

  const originalSlug = str(formData.get("originalSlug"), 80);
  const title = str(formData.get("title"), 200);
  const explicitSlug = str(formData.get("slug"), 80);
  const excerpt = str(formData.get("excerpt"), 400);
  const body = str(formData.get("body"), 100_000);
  const coverImage = str(formData.get("coverImage"), 500);
  const author = str(formData.get("author"), 120) || "Wynn Essentials";
  const status = formData.get("status") === "published" ? "published" : "draft";
  if (!title || !body) throw new Error("Title and body are required.");

  const slug = originalSlug || slugify(explicitSlug || title);
  if (!slug) throw new Error("Could not build a URL slug from the title.");

  const db = getDb();
  const [existing] = await db.select({ slug: blogPosts.slug, publishedAt: blogPosts.publishedAt }).from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);
  // Stamp publishedAt the first time a post goes live; keep it thereafter.
  const publishedAt = status === "published" ? (existing?.publishedAt ?? new Date()) : (existing?.publishedAt ?? null);

  await db
    .insert(blogPosts)
    .values({ slug, title, excerpt: excerpt || null, body, coverImage: coverImage || null, author, status, publishedAt, updatedAt: new Date() })
    .onConflictDoUpdate({ target: blogPosts.slug, set: { title, excerpt: excerpt || null, body, coverImage: coverImage || null, author, status, publishedAt, updatedAt: new Date() } });

  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
}

export async function deletePost(formData: FormData) {
  if (!(await isAuthenticated())) throw new Error("Not authorized.");
  const slug = str(formData.get("slug"), 80);
  if (!slug) throw new Error("Invalid post.");
  await getDb().delete(blogPosts).where(eq(blogPosts.slug, slug));
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
}
