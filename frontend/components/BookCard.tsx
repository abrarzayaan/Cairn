"use client";

import Link from "next/link";
import { BookOpen, FilePlus2, Lock, Globe } from "lucide-react";
import { BookSummary } from "@/lib/api";

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function BookCard({
  book,
  showAuthor = true,
  isOwner = false,
}: {
  book: BookSummary;
  showAuthor?: boolean;
  isOwner?: boolean;
}) {
  const isPrivate = book.visibility === "private";

  return (
    <article className="group flex flex-col justify-between rounded-md border border-border bg-bg p-4 transition-colors hover:border-border-strong">
      <div>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="inline-flex items-center rounded border border-border bg-bg-subtle px-2 py-0.5 font-mono text-[11px] font-medium text-text-muted">
            {book.category.name}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] ${
              isPrivate
                ? "border-warn/40 bg-bg-subtle text-warn"
                : book.is_published
                ? "border-ok/30 bg-bg-subtle text-ok"
                : "border-accent/30 bg-bg-subtle text-accent"
            }`}
          >
            {isPrivate ? (
              <>
                <Lock className="h-3 w-3" />
                <span>Private</span>
              </>
            ) : book.is_published ? (
              <>
                <Globe className="h-3 w-3" />
                <span>Published</span>
              </>
            ) : (
              <>
                <BookOpen className="h-3 w-3" />
                <span>Public (Desk)</span>
              </>
            )}
          </span>
        </div>

        <Link
          href={`/u/${book.author_username}/books/${book.slug}`}
          className="block font-sans text-base font-semibold tracking-tight text-text transition-colors group-hover:text-accent hover:no-underline"
        >
          {book.title}
        </Link>

        {book.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-text-muted">
            {book.description}
          </p>
        ) : (
          <p className="mt-1.5 font-mono text-xs text-text-muted/70">
            Sequential documentation book
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 font-mono text-[11px] text-text-muted">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1 text-text">
            <BookOpen className="h-3.5 w-3.5 text-accent" />
            {book.chapter_count} {book.chapter_count === 1 ? "chapter" : "chapters"}
          </span>
          {showAuthor && (
            <Link
              href={`/u/${book.author_username}`}
              className="hover:text-text hover:underline"
            >
              @{book.author_username}
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <span>{formatShortDate(book.updated_at)}</span>
          {isOwner && (
            <Link
              href={`/new?book=${book.id}`}
              className="inline-flex items-center gap-1 rounded border border-border bg-bg-subtle px-2 py-0.5 text-text hover:border-accent hover:text-accent hover:no-underline"
              title="Add chapter to this book"
            >
              <FilePlus2 className="h-3 w-3" />
              <span>Chapter</span>
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

