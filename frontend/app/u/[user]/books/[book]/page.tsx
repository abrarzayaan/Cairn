import { cache } from "react";
import { cookies } from "next/headers";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import BookTocClient from "@/components/BookTocClient";

interface BookPageProps {
  params: Promise<{
    user: string;
    book: string;
  }>;
}

const getBookData = cache(async (user: string, book: string, cookieHeader: string) => {
  const backendUrl =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.BACKEND_URL ||
    "http://127.0.0.1:8000";
  try {
    const res = await fetch(
      `${backendUrl}/api/v1/books/by-slug/${encodeURIComponent(user)}/${encodeURIComponent(book)}`,
      {
        cache: "no-store",
        headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { user, book } = await params;
  const cookieStore = await cookies();
  const data = await getBookData(user, book, cookieStore.toString());
  const b = data?.book;

  // Never emit private/hidden book details into metadata/OG tags
  if (!b || b.visibility !== "public" || b.moderation === "hidden") {
    return {
      title: "Cairn",
      robots: { index: false, follow: false },
    };
  }

  const title = `${b.title} — @${b.author_username}`;
  const description =
    b.description ||
    `Documentation book "${b.title}" by @${b.author_username} on Cairn.`;
  const canonicalPath = `/u/${b.author_username}/books/${b.slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: b.is_published
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      type: "article",
      siteName: "Cairn",
      title,
      description,
      url: canonicalPath,
    },
  };
}

export default async function BookContextPage({ params }: BookPageProps) {
  const { user, book } = await params;
  const cookieStore = await cookies();
  const data = await getBookData(user, book, cookieStore.toString());

  if (!data) {
    notFound();
  }

  return (
    <BookTocClient
      initialBook={data.book}
      initialChapters={data.chapters || []}
    />
  );
}

