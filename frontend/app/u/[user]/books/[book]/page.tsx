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

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { user, book } = await params;
  const backendUrl =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.BACKEND_URL ||
    "http://127.0.0.1:8000";

  try {
    // Fetch anonymously so private books never leak into meta tags
    const res = await fetch(
      `${backendUrl}/api/v1/books/by-slug/${encodeURIComponent(user)}/${encodeURIComponent(book)}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return {
        title: "Cairn",
        robots: { index: false, follow: false },
      };
    }
    const data = await res.json();
    const b = data.book;
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
  } catch {
    return {
      title: "Cairn",
    };
  }
}

export default async function BookContextPage({ params }: BookPageProps) {
  const { user, book } = await params;
  const backendUrl =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.BACKEND_URL ||
    "http://127.0.0.1:8000";
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let res;
  try {
    res = await fetch(
      `${backendUrl}/api/v1/books/by-slug/${encodeURIComponent(user)}/${encodeURIComponent(book)}`,
      {
        cache: "no-store",
        headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      }
    );
  } catch {
    notFound();
  }

  if (!res.ok) {
    notFound();
  }

  const data = await res.json();
  return (
    <BookTocClient
      initialBook={data.book}
      initialChapters={data.chapters || []}
    />
  );
}

