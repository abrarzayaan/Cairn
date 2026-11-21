import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

interface SitemapEntry {
  path: string;
  updated_at: string;
}

interface SitemapPayload {
  notes: SitemapEntry[];
  books: SitemapEntry[];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ).replace(/\/+$/, "");
  const backendUrl =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.BACKEND_URL ||
    "http://127.0.0.1:8000";

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      changeFrequency: "daily",
      priority: 1,
    },
  ];

  try {
    const res = await fetch(`${backendUrl}/api/v1/seo/sitemap`, {
      cache: "no-store",
    });
    if (!res.ok) return entries;

    const data: SitemapPayload = await res.json();

    for (const book of data.books || []) {
      entries.push({
        url: `${siteUrl}${book.path}`,
        lastModified: new Date(book.updated_at),
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }

    for (const note of data.notes || []) {
      entries.push({
        url: `${siteUrl}${note.path}`,
        lastModified: new Date(note.updated_at),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  } catch {
    // Fallback gracefully to root entry if backend is unavailable during build
  }

  return entries;
}
