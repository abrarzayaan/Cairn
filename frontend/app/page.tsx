"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  BookOpen,
  FileText,
  FolderKanban,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import BookCard from "@/components/BookCard";
import CreateBookModal from "@/components/CreateBookModal";
import {
  BookSummary,
  Category,
  fetchBooks,
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

const SAMPLE_BOOK = {
  category: "Frontend",
  title: "Modern JavaScript Mental Model",
  description: "From lexical bindings to closures and React hook lifetimes, ordered step by step.",
  chapters: [
    { seq: "01", title: "Variables & Memory", summary: "Stack bindings, heap references, let vs const" },
    { seq: "02", title: "Lexical Scope", summary: "How inner blocks resolve outer environment records" },
    { seq: "03", title: "Closures", summary: "Retained lexical scope across async boundaries" },
    { seq: "04", title: "React Hooks & Lifetimes", summary: "Why stale closures happen in useEffect" },
  ],
};

function ChapterFeedRow({ note }: { note: WorkspaceNote }) {
  return (
    <li className="rounded border border-border bg-bg p-3 transition-colors hover:border-border-strong">
      <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[11px] text-text-muted">
        {note.book_title && note.book_slug ? (
          <Link
            href={`/u/${note.author_username}/books/${note.book_slug}`}
            className="truncate text-accent hover:underline"
          >
            {note.book_title} · Ch. {String(note.sequence || 1).padStart(2, "0")}
          </Link>
        ) : (
          <span>Standalone note</span>
        )}
        <span className="shrink-0">{formatShortDate(note.updated_at)}</span>
      </div>

      <Link
        href={`/u/${note.author_username}/${note.slug}`}
        className="block font-sans text-sm font-semibold text-text hover:text-accent hover:no-underline"
      >
        {note.title}
      </Link>

      <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[11px] text-text-muted">
        <Link
          href={`/u/${note.author_username}`}
          className="hover:text-text hover:underline"
        >
          @{note.author_username}
        </Link>
        {note.tags.length > 0 && (
          <span className="truncate">#{note.tags.slice(0, 2).join(" #")}</span>
        )}
      </div>
    </li>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [publicBooks, setPublicBooks] = useState<BookSummary[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [booksLoading, setBooksLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [bookModalOpen, setBookModalOpen] = useState(false);

  const loadHub = async () => {
    try {
      const [meRes, homeRes] = await Promise.all([fetchMe(), fetchHomeFeed()]);
      if (meRes.authenticated && meRes.user) {
        setUser(meRes.user);
      }
      setFeed(homeRes);
      setPublicBooks(homeRes.recent_books || []);
    } catch {
      // Fallback empty state handled cleanly
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHub();
  }, []);

  const handleSelectCategory = async (slug: string) => {
    setSelectedCategory(slug);
    setBooksLoading(true);
    try {
      const books = await fetchBooks(
        slug === "all" ? { limit: 24 } : { category: slug, limit: 24 }
      );
      setPublicBooks(books);
    } finally {
      setBooksLoading(false);
    }
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    } else {
      router.push("/search");
    }
  };

  const handleBookCreated = (book: BookSummary, createdCategory?: Category) => {
    setFeed((prev) => {
      if (!prev) return prev;
      const cats =
        createdCategory && !prev.categories.some((c) => c.id === createdCategory.id)
          ? [...prev.categories, createdCategory].sort((a, b) => a.name.localeCompare(b.name))
          : prev.categories;
      return {
        ...prev,
        categories: cats,
        my_books: [book, ...prev.my_books],
        book_stats: {
          ...prev.book_stats,
          total: prev.book_stats.total + 1,
          public: prev.book_stats.public + (book.visibility === "public" ? 1 : 0),
          private: prev.book_stats.private + (book.visibility === "private" ? 1 : 0),
        },
      };
    });
    if (book.visibility === "public") {
      setPublicBooks((prev) => [book, ...prev]);
    }
    router.push(`/u/${book.author_username}/books/${book.slug}`);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1240px] space-y-6">
        <div className="h-32 animate-pulse rounded-md border border-border bg-bg-subtle" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          <div className="h-80 animate-pulse rounded-md border border-border bg-bg-subtle" />
          <div className="h-80 animate-pulse rounded-md border border-border bg-bg-subtle" />
        </div>
      </div>
    );
  }

  const categories = feed?.categories || [];
  const myBooks = feed?.my_books || [];
  const myNotes = feed?.my_notes || [];
  const recentPublic = feed?.recent_public || [];
  const topics = feed?.topics || [];

  return (
    <div className="mx-auto max-w-[1240px] space-y-8">
      {/* DOCS HUB HEADER */}
      <section className="rounded-md border border-border bg-bg-subtle p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-accent">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Book-First Developer Docs</span>
            </div>
            <h1 className="font-sans text-2xl font-semibold tracking-tight text-text sm:text-3xl">
              {user
                ? `Welcome back, @${user.username}`
                : "Write structured developer books. Read in sequence."}
            </h1>
            <p className="text-sm leading-relaxed text-text-muted sm:text-base">
              Organize notes into topic <strong className="font-medium text-text">Categories</strong> and ordered{" "}
              <strong className="font-medium text-text">Documentation Books</strong>. Follow chapters step by step,
              or explore public engineering docs across developers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => setBookModalOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded border border-border-strong bg-bg px-3.5 font-medium text-text hover:border-accent hover:text-accent"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Book</span>
                </button>
                <Link
                  href="/new"
                  className="inline-flex h-9 items-center gap-1.5 rounded bg-text px-4 font-medium text-bg hover:bg-accent hover:no-underline"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Write Chapter</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex h-9 items-center rounded bg-text px-4 font-medium text-bg hover:bg-accent hover:no-underline"
                >
                  Sign in with GitHub &rarr;
                </Link>
                <Link
                  href="/search"
                  className="inline-flex h-9 items-center rounded border border-border-strong bg-bg px-3.5 text-text hover:border-text-muted hover:no-underline"
                >
                  Explore Search
                </Link>
              </>
            )}
          </div>
        </div>

        {/* SEARCH BAR */}
        <form onSubmit={handleSearchSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search books, chapters, topics, or @developer..."
              className="h-10 w-full rounded border border-border-strong bg-bg pl-9 pr-3 font-mono text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded border border-border-strong bg-bg px-5 font-mono text-xs font-medium text-text hover:border-accent hover:text-accent"
          >
            Search Docs
          </button>
        </form>

        {/* CATEGORY EXPLORER */}
        {categories.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-4 font-mono text-xs">
            <span className="mr-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-text-muted">
              <FolderKanban className="h-3 w-3" />
              Categories:
            </span>
            <button
              type="button"
              onClick={() => handleSelectCategory("all")}
              className={`rounded border px-2.5 py-1 transition-colors ${
                selectedCategory === "all"
                  ? "border-accent bg-accent text-bg font-medium"
                  : "border-border bg-bg text-text-muted hover:border-border-strong hover:text-text"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectCategory(cat.slug)}
                className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 transition-colors ${
                  selectedCategory === cat.slug
                    ? "border-accent bg-accent text-bg font-medium"
                    : "border-border bg-bg text-text-muted hover:border-border-strong hover:text-text"
                }`}
              >
                <span>{cat.name}</span>
                <span className="opacity-70">{cat.book_count}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* SIGNED-IN PERSONAL BOOKSHELF */}
      {user && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
            <div className="flex items-center gap-3">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text">
                Your Documentation Bookshelf
              </h2>
              {feed && (
                <span className="font-mono text-xs text-text-muted">
                  {feed.book_stats.total} {feed.book_stats.total === 1 ? "book" : "books"} &middot;{" "}
                  {feed.stats.total} {feed.stats.total === 1 ? "note" : "notes"}
                </span>
              )}
            </div>
            <Link
              href={`/u/${user.username}`}
              className="font-mono text-xs text-accent hover:underline"
            >
              Open Full Profile &rarr;
            </Link>
          </div>

          {myBooks.length === 0 ? (
            <div className="flex flex-col items-start justify-between gap-4 rounded-md border border-dashed border-border-strong bg-bg-subtle p-5 sm:flex-row sm:items-center">
              <div>
                <p className="font-sans text-sm font-medium text-text">
                  Create your first Documentation Book
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  Pick a category like Backend or Database and organize chapters in sequence.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBookModalOpen(true)}
                className="shrink-0 rounded bg-text px-4 py-2 font-mono text-xs font-medium text-bg hover:bg-accent"
              >
                + New Book
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {myBooks.slice(0, 6).map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  showAuthor={false}
                  isOwner={true}
                />
              ))}
            </div>
          )}

          {myNotes.some((n) => !n.book_id) && (
            <div className="rounded-md border border-border bg-bg-subtle p-4">
              <div className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-text-muted">
                <span>Unassigned Standalone Notes</span>
                <span>Assign a Book in Editor</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {myNotes
                  .filter((n) => !n.book_id)
                  .slice(0, 6)
                  .map((n) => (
                    <Link
                      key={n.id}
                      href={`/u/${n.author_username}/${n.slug}/edit`}
                      className="rounded border border-border bg-bg px-2.5 py-1 font-mono text-xs text-text hover:border-accent hover:text-accent hover:no-underline"
                    >
                      {n.title}
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* MAIN TWO-COLUMN DISCOVERY GRID */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_310px]">
        {/* PUBLIC BOOKS LIBRARY */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text">
              {selectedCategory === "all"
                ? "Public Documentation Books"
                : `Category: ${
                    categories.find((c) => c.slug === selectedCategory)?.name ||
                    selectedCategory
                  }`}
            </h2>
            <Link
              href={
                selectedCategory === "all"
                  ? "/search?type=books"
                  : `/search?type=books&category=${encodeURIComponent(selectedCategory)}`
              }
              className="font-mono text-xs text-accent hover:underline"
            >
              Browse all &rarr;
            </Link>
          </div>

          {booksLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="h-36 animate-pulse rounded-md border border-border bg-bg-subtle" />
              <div className="h-36 animate-pulse rounded-md border border-border bg-bg-subtle" />
            </div>
          ) : publicBooks.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {publicBooks.map((book) => (
                <BookCard key={book.id} book={book} showAuthor={true} />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-dashed border-border-strong bg-bg-subtle p-6">
                <p className="font-sans text-base font-medium text-text">
                  {selectedCategory === "all"
                    ? "No public documentation books published yet."
                    : "No public books in this category yet."}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  Here is how a sequential documentation book looks on Cairn:
                </p>
                {user && (
                  <button
                    type="button"
                    onClick={() => setBookModalOpen(true)}
                    className="mt-3 rounded bg-text px-3.5 py-1.5 font-mono text-xs text-bg hover:bg-accent"
                  >
                    + Start a Book
                  </button>
                )}
              </div>

              {/* Sample Sequential Book Preview */}
              <div className="rounded-md border border-border bg-bg p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="rounded border border-border bg-bg-subtle px-2 py-0.5 font-mono text-[11px] text-accent">
                    {SAMPLE_BOOK.category} &middot; Sample Book
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-text-muted">
                    <Sparkles className="h-3 w-3 text-accent" />
                    Sequential TOC
                  </span>
                </div>
                <h3 className="font-sans text-lg font-semibold text-text">
                  {SAMPLE_BOOK.title}
                </h3>
                <p className="mt-1 text-sm text-text-muted">{SAMPLE_BOOK.description}</p>
                <ol className="mt-4 divide-y divide-border rounded border border-border bg-bg-subtle">
                  {SAMPLE_BOOK.chapters.map((ch) => (
                    <li
                      key={ch.seq}
                      className="flex items-start gap-3 px-3.5 py-2.5 text-sm"
                    >
                      <span className="font-mono text-xs font-semibold text-accent">
                        {ch.seq}
                      </span>
                      <div>
                        <div className="font-medium text-text">{ch.title}</div>
                        <div className="text-xs text-text-muted">{ch.summary}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT SIDEBAR: RECENT CHAPTERS & TOPICS */}
        <aside className="space-y-6">
          <section>
            <h2 className="mb-3 border-b border-border pb-2 font-mono text-xs font-semibold uppercase tracking-wider text-text">
              Recently Updated Chapters
            </h2>
            {recentPublic.length === 0 ? (
              <p className="rounded border border-dashed border-border p-4 font-mono text-xs text-text-muted">
                No public chapters yet.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {recentPublic.slice(0, 8).map((note) => (
                  <ChapterFeedRow key={note.id} note={note} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 border-b border-border pb-2 font-mono text-xs font-semibold uppercase tracking-wider text-text">
              Tags
            </h2>
            {topics.length === 0 ? (
              <p className="font-mono text-xs text-text-muted">No tags yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                {topics.map((topic) => (
                  <Link
                    key={topic.name}
                    href={`/tags/${encodeURIComponent(topic.name)}`}
                    className="inline-flex items-center gap-1 rounded border border-border bg-bg-subtle px-2 py-1 text-text-muted hover:border-accent hover:text-accent hover:no-underline"
                  >
                    <span>#{topic.name}</span>
                    <span className="text-[10px] opacity-75">{topic.count}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      <CreateBookModal
        open={bookModalOpen}
        categories={categories}
        onClose={() => setBookModalOpen(false)}
        onCreated={handleBookCreated}
      />
    </div>
  );
}
