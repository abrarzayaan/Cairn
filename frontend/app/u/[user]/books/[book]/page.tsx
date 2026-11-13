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
  return {
    title: `${book} · @${user} · Cairn Docs`,
  };
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

