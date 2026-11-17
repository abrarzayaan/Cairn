"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Clock,
  Compass,
  FileText,
  FolderPlus,
  Plus,
} from "lucide-react";
import BookCard from "@/components/BookCard";
import CreateBookModal from "@/components/CreateBookModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  fetchHomeFeed,
  fetchMe,
  HomeFeed,
  User,
  WorkspaceNote,
} from "@/lib/api";

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function ChapterRow({ note }: { note: WorkspaceNote }) {
  return (
    <li className="group flex items-center justify-between gap-4 rounded-sm px-3 py-2.5 transition-colors hover:bg-surface-1">
      <div className="min-w-0 flex-1">
        <Link
          href={`/u/${note.author_username}/${note.slug}`}
          className="block truncate text-sm font-medium text-text-primary group-hover:text-accent hover:no-underline"
        >
          {note.title}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
          {note.book_title && note.book_slug ? (
            <Link
              href={`/u/${note.author_username}/books/${note.book_slug}`}
              className="truncate text-accent hover:underline"
            >
              {note.book_title} &middot; Ch.{" "}
              {String(note.sequence || 1).padStart(2, "0")}
            </Link>
          ) : (
            <span>Standalone note</span>
          )}
          <span>&middot;</span>
          <Link
            href={`/u/${note.author_username}`}
            className="hover:text-text-primary hover:no-underline"
          >
            @{note.author_username}
          </Link>
        </div>
      </div>
      <span className="shrink-0 text-xs text-text-tertiary">
        {formatShortDate(note.updated_at)}
      </span>
    </li>
  );
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookModalOpen, setBookModalOpen] = useState(false);

  const loadHub = async () => {
    try {
      const [meRes, homeRes] = await Promise.all([fetchMe(), fetchHomeFeed()]);
      if (meRes.authenticated && meRes.user) {
        setUser(meRes.user);
      }
      setFeed(homeRes);
    } catch {
      // Fallback empty state handled cleanly
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHub();
  }, []);

  const publicBooks = feed?.recent_books || [];
  const recentNotes = feed?.recent_public || [];
  const myBooks = feed?.my_books || [];
  const myRecentNotes = (feed?.my_notes || []).slice(0, 5);
  const discoverBooks = publicBooks.filter(
    (b) => !user || b.author_username !== user.username,
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-sm bg-surface-2" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-40 animate-pulse rounded-md bg-surface-1"
            />
          ))}
        </div>
      </div>
    );
  }

  /* Logged-out Clean Editorial View */
  if (!user) {
    return (
      <div className="mx-auto max-w-5xl space-y-12 py-4">
        {/* Centered Hero */}
        <section className="mx-auto max-w-2xl space-y-4 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            Linked documentation &amp; knowledge books for developers.
          </h1>
          <p className="text-base leading-relaxed text-text-secondary">
            Write structured notes, organize chapters into sequential books, and
            trace prerequisite reading paths across your personal desk.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button asChild size="lg" variant="primary">
              <Link href="/login" className="hover:no-underline">
                Sign in with GitHub
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/search" className="hover:no-underline">
                <Compass className="h-4 w-4" />
                Explore Docs
              </Link>
            </Button>
          </div>
        </section>

        {/* Published Books Grid (3 col) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">
              Published Books
            </h2>
            <Link
              href="/search?type=book"
              className="text-xs font-medium text-accent hover:underline"
            >
              View all &rarr;
            </Link>
          </div>

          {publicBooks.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {publicBooks.slice(0, 6).map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
          ) : (
            <Card variant="ghost" className="p-8 text-center">
              <BookOpen className="mx-auto mb-2 h-6 w-6 text-text-tertiary" />
              <p className="text-sm font-medium text-text-primary">
                No published books yet
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                Sign in with GitHub to create and publish the first book.
              </p>
            </Card>
          )}
        </section>

        {/* Recent Chapters (compact list) */}
        {recentNotes.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Recent Chapters
            </h2>
            <Card variant="flat" className="divide-y divide-border-subtle p-2">
              <ul className="divide-y divide-border-subtle">
                {recentNotes.slice(0, 6).map((note) => (
                  <ChapterRow key={note.id} note={note} />
                ))}
              </ul>
            </Card>
          </section>
        )}
      </div>
    );
  }

  /* Logged-in Dashboard */
  return (
    <div className="mx-auto max-w-5xl space-y-10">
      {/* Compact Welcome Header */}
      <section className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            Welcome back, @{user.username}
          </h1>
          <p className="mt-0.5 text-sm text-text-tertiary">
            Your personal desk, recent edits, and published books.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setBookModalOpen(true)}
          >
            <FolderPlus className="h-4 w-4" />
            New Book
          </Button>
          <Button asChild variant="primary" size="md">
            <Link href="/new" className="hover:no-underline">
              <Plus className="h-4 w-4" />
              New Note
            </Link>
          </Button>
        </div>
      </section>

      {/* Recent Activity (last 5 edits) */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-text-tertiary" />
          <h2 className="text-base font-semibold text-text-primary">
            Recent Activity
          </h2>
        </div>

        {myRecentNotes.length > 0 ? (
          <Card variant="flat" className="p-2">
            <ul className="divide-y divide-border-subtle">
              {myRecentNotes.map((note) => (
                <ChapterRow key={note.id} note={note} />
              ))}
            </ul>
          </Card>
        ) : (
          <Card variant="ghost" className="p-6 text-center">
            <FileText className="mx-auto mb-2 h-5 w-5 text-text-tertiary" />
            <p className="text-sm font-medium text-text-primary">
              No recent edits yet
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              Start writing your first note or chapter to see activity here.
            </p>
          </Card>
        )}
      </section>

      {/* Your Bookshelf (3 col grid) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">
            Your Bookshelf
          </h2>
          <Link
            href={`/u/${user.username}`}
            className="text-xs font-medium text-accent hover:underline"
          >
            Open desk &rarr;
          </Link>
        </div>

        {myBooks.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                showAuthor={false}
                isOwner
              />
            ))}
          </div>
        ) : (
          <Card variant="ghost" className="p-8 text-center">
            <BookOpen className="mx-auto mb-2 h-6 w-6 text-text-tertiary" />
            <p className="text-sm font-medium text-text-primary">
              Your bookshelf is empty
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              Create a book to group sequential chapters by topic.
            </p>
            <div className="mt-4">
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => setBookModalOpen(true)}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Create your first book
              </Button>
            </div>
          </Card>
        )}
      </section>

      {/* Discover: Published from other developers */}
      {discoverBooks.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-primary">
              Discover
            </h2>
            <Link
              href="/search"
              className="text-xs font-medium text-accent hover:underline"
            >
              Explore all &rarr;
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {discoverBooks.slice(0, 6).map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </section>
      )}

      <CreateBookModal
        open={bookModalOpen}
        categories={feed?.categories || []}
        onClose={() => setBookModalOpen(false)}
        onCreated={() => {
          setBookModalOpen(false);
          loadHub();
        }}
      />
    </div>
  );
}
