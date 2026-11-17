"use client";

import Link from "next/link";
import { BookOpen, FilePlus2, Globe, Lock } from "lucide-react";
import { BookSummary } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";

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
    <Card
      variant="interactive"
      className="group flex flex-col justify-between p-5"
    >
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <Badge variant="default" size="sm">
            {book.category.name}
          </Badge>

          {isPrivate ? (
            <Badge variant="warning" size="sm">
              <Lock className="h-3 w-3" />
              <span>Private</span>
            </Badge>
          ) : book.is_published ? (
            <Badge variant="success" size="sm">
              <Globe className="h-3 w-3" />
              <span>Published</span>
            </Badge>
          ) : (
            <Badge variant="info" size="sm">
              <BookOpen className="h-3 w-3" />
              <span>Public (Desk)</span>
            </Badge>
          )}
        </div>

        <Link
          href={`/u/${book.author_username}/books/${book.slug}`}
          className="block font-sans text-base font-semibold tracking-tight text-text-primary transition-colors group-hover:text-accent hover:no-underline"
        >
          {book.title}
        </Link>

        {book.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-text-secondary">
            {book.description}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-text-tertiary">
            Sequential documentation book
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3 text-xs text-text-tertiary">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-medium text-text-secondary">
            <BookOpen className="h-3.5 w-3.5 text-accent" />
            {book.chapter_count}{" "}
            {book.chapter_count === 1 ? "chapter" : "chapters"}
          </span>
          {showAuthor && (
            <Link
              href={`/u/${book.author_username}`}
              className="hover:text-text-primary hover:no-underline"
            >
              @{book.author_username}
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <span>{formatShortDate(book.updated_at)}</span>
          {isOwner && (
            <Tooltip content="Add chapter to this book">
              <Link
                href={`/new?book=${book.id}`}
                className="inline-flex items-center gap-1 rounded-sm bg-surface-1 px-2 py-0.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent hover:no-underline"
              >
                <FilePlus2 className="h-3 w-3" />
                <span>Chapter</span>
              </Link>
            </Tooltip>
          )}
        </div>
      </div>
    </Card>
  );
}
