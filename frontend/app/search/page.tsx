"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderKanban, User as UserIcon } from "lucide-react";
import BookCard from "@/components/BookCard";
import {
  BookSummary,
  Category,
  fetchCategories,
  SearchHit,
  searchNotes,
  UserSearchHit,
} from "@/lib/api";

const PAGE_SIZE = 20;
type SearchType = "all" | "books" | "notes" | "categories" | "users";

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialQ = searchParams.get("q") || "";
  const initialType = (searchParams.get("type") as SearchType) || "all";
  const initialCategory = searchParams.get("category") || "";
  const initialTag = searchParams.get("tag") || "";
  const initialAuthor = searchParams.get("author") || "";
  const initialScope = searchParams.get("scope") === "mine" ? "mine" : "all";
  const initialOffset = Math.max(0, Number(searchParams.get("offset") || "0") || 0);

  const [q, setQ] = useState(initialQ);
  const [searchType, setSearchType] = useState<SearchType>(
    ["all", "books", "notes", "categories", "users"].includes(initialType)
      ? initialType
      : "all"
  );
  const [category, setCategory] = useState(initialCategory);
  const [tag, setTag] = useState(initialTag);
  const [author, setAuthor] = useState(initialAuthor);
  const [scope, setScope] = useState<"all" | "mine">(initialScope);
  const [offset, setOffset] = useState(initialOffset);
  const [allCategories, setAllCategories] = useState<Category[]>([]);

  const [results, setResults] = useState<SearchHit[]>([]);
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<UserSearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories().then(setAllCategories);
  }, []);

  useEffect(() => {
    const nextType = (searchParams.get("type") as SearchType) || "all";
    setQ(searchParams.get("q") || "");
    setSearchType(
      ["all", "books", "notes", "categories", "users"].includes(nextType)
        ? nextType
        : "all"
    );
    setCategory(searchParams.get("category") || "");
    setTag(searchParams.get("tag") || "");
    setAuthor(searchParams.get("author") || "");
    setScope(searchParams.get("scope") === "mine" ? "mine" : "all");
    setOffset(Math.max(0, Number(searchParams.get("offset") || "0") || 0));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await searchNotes({
          q: initialQ,
          type: initialType,
          category: initialCategory || undefined,
          tag: initialTag || undefined,
          author: initialAuthor || undefined,
          scope: initialScope,
          limit: PAGE_SIZE,
          offset: initialOffset,
        });
        if (!cancelled) {
          setResults(res.results || []);
          setBooks(res.books || []);
          setCategories(res.categories || []);
          setUsers(res.users || []);
          setTotal(res.total);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Search failed.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [
    initialQ,
    initialType,
    initialCategory,
    initialTag,
    initialAuthor,
    initialScope,
    initialOffset,
  ]);

  const applyFilters = (nextOffset = 0, overrideType?: SearchType) => {
    const t = overrideType ?? searchType;
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (t !== "all") sp.set("type", t);
    if (category.trim()) sp.set("category", category.trim());
    if (tag.trim()) sp.set("tag", tag.trim().replace(/^#/, ""));
    if (author.trim()) sp.set("author", author.trim().replace(/^@/, ""));
    if (scope === "mine") sp.set("scope", "mine");
    if (nextOffset > 0) sp.set("offset", String(nextOffset));
    router.push(`/search?${sp.toString()}`);
  };

  const hasAnyHit =
    books.length > 0 ||
    results.length > 0 ||
    categories.length > 0 ||
    users.length > 0;

  return (
    <div className="mx-auto max-w-[1040px] space-y-6 py-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-wider text-accent">
          Unified Documentation Search
        </p>
        <h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-text">
          Search Books, Chapters, Categories &amp; Developers
        </h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters(0);
        }}
        className="space-y-3 rounded-md border border-border bg-bg-subtle p-4"
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search books, chapters, topics, or @username..."
            className="flex-1 rounded border border-border-strong bg-bg px-3 py-2 font-mono text-sm text-text focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            className="rounded bg-text px-5 py-2 font-mono text-xs font-medium text-bg hover:bg-accent"
          >
            Search
          </button>
        </div>

        {/* TYPE PILLS */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          {(
            [
              ["all", "All"],
              ["books", "Books"],
              ["notes", "Chapters & Notes"],
              ["categories", "Categories"],
              ["users", "Developers"],
            ] as [SearchType, string][]
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => {
                setSearchType(val);
                applyFilters(0, val);
              }}
              className={`rounded border px-2.5 py-1 transition-colors ${
                searchType === val
                  ? "border-accent bg-accent text-bg font-medium"
                  : "border-border bg-bg text-text-muted hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* SECONDARY FILTERS */}
        <div className="grid grid-cols-1 gap-2.5 pt-1 font-mono text-xs sm:grid-cols-4">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
            className="rounded border border-border bg-bg px-2.5 py-1.5 text-text focus:border-accent focus:outline-none"
          >
            <option value="">All Categories</option>
            {allCategories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name} ({c.book_count})
              </option>
            ))}
          </select>

          <input
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="#tag (e.g. sql)"
            className="rounded border border-border bg-bg px-2.5 py-1.5 text-text focus:border-accent focus:outline-none"
          />

          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="@developer"
            className="rounded border border-border bg-bg px-2.5 py-1.5 text-text focus:border-accent focus:outline-none"
          />

          <div className="flex rounded border border-border bg-bg p-0.5">
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`flex-1 rounded py-1 ${
                scope === "all" ? "bg-bg-inset font-semibold text-text" : "text-text-muted"
              }`}
            >
              All Docs
            </button>
            <button
              type="button"
              onClick={() => setScope("mine")}
              className={`flex-1 rounded py-1 ${
                scope === "mine" ? "bg-bg-inset font-semibold text-text" : "text-text-muted"
              }`}
            >
              My Docs
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="rounded border border-danger/40 bg-bg-subtle p-3 font-mono text-xs text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-10 font-mono text-xs text-text-muted">Searching...</div>
      ) : !hasAnyHit ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center font-mono text-xs text-text-muted">
          No matching books, chapters, categories, or developers found.
        </div>
      ) : (
        <div className="space-y-8">
          {/* DEVELOPERS */}
          {users.length > 0 && (
            <section className="space-y-3">
              <h2 className="border-b border-border pb-2 font-mono text-xs font-semibold uppercase tracking-wider text-text">
                Developers ({users.length})
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {users.map((u) => (
                  <Link
                    key={u.username}
                    href={`/u/${u.username}`}
                    className="flex items-start gap-3 rounded-md border border-border bg-bg p-3.5 transition-colors hover:border-accent hover:no-underline"
                  >
                    <UserIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold text-text">
                        @{u.username}
                      </div>
                      {u.bio && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">
                          {u.bio}
                        </p>
                      )}
                      <div className="mt-1 font-mono text-[11px] text-text-muted">
                        {u.public_book_count} books &middot; {u.public_note_count} notes
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* CATEGORIES */}
          {categories.length > 0 && (
            <section className="space-y-3">
              <h2 className="border-b border-border pb-2 font-mono text-xs font-semibold uppercase tracking-wider text-text">
                Categories ({categories.length})
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/search?type=books&category=${encodeURIComponent(cat.slug)}`}
                    className="flex items-start gap-3 rounded-md border border-border bg-bg p-3.5 transition-colors hover:border-accent hover:no-underline"
                  >
                    <FolderKanban className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <div>
                      <div className="font-sans text-sm font-semibold text-text">
                        {cat.name}
                      </div>
                      {cat.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">
                          {cat.description}
                        </p>
                      )}
                      <div className="mt-1 font-mono text-[11px] text-text-muted">
                        {cat.book_count} public {cat.book_count === 1 ? "book" : "books"}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* DOCUMENTATION BOOKS */}
          {books.length > 0 && (
            <section className="space-y-3">
              <h2 className="border-b border-border pb-2 font-mono text-xs font-semibold uppercase tracking-wider text-text">
                Documentation Books ({books.length})
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {books.map((book) => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>
            </section>
          )}

          {/* CHAPTERS / NOTES */}
          {results.length > 0 && (
            <section className="space-y-3">
              <h2 className="border-b border-border pb-2 font-mono text-xs font-semibold uppercase tracking-wider text-text">
                Chapters &amp; Notes ({total})
              </h2>
              <ul className="space-y-3">
                {results.map((hit) => (
                  <li
                    key={hit.id}
                    className="rounded-md border border-border bg-bg p-4 transition-colors hover:border-border-strong"
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {hit.book_title && hit.book_slug && (
                          <Link
                            href={`/u/${hit.author_username}/books/${hit.book_slug}`}
                            className="rounded border border-border bg-bg-subtle px-2 py-0.5 font-mono text-[11px] text-accent hover:underline"
                          >
                            {hit.book_title} · Ch.{" "}
                            {String(hit.sequence || 1).padStart(2, "0")}
                          </Link>
                        )}
                        <Link
                          href={`/u/${hit.author_username}/${hit.slug}`}
                          className="font-sans text-base font-semibold text-text hover:text-accent hover:no-underline"
                        >
                          {hit.title}
                        </Link>
                      </div>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${
                          hit.visibility === "private"
                            ? "border-warn/40 bg-bg-subtle text-warn"
                            : "border-ok/30 bg-bg-subtle text-ok"
                        }`}
                      >
                        {hit.visibility}
                      </span>
                    </div>

                    {hit.snippet && (
                      <p className="mb-2 line-clamp-2 text-sm text-text-muted">
                        {hit.snippet}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-text-muted">
                      <Link
                        href={`/u/${hit.author_username}`}
                        className="hover:text-text hover:underline"
                      >
                        @{hit.author_username}
                      </Link>
                      {hit.tags.map((t) => (
                        <Link
                          key={t}
                          href={`/tags/${encodeURIComponent(t)}`}
                          className="rounded border border-border bg-bg-subtle px-1.5 py-0.5 hover:border-accent hover:text-accent hover:no-underline"
                        >
                          #{t}
                        </Link>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>

              {total > PAGE_SIZE && (
                <div className="flex items-center justify-between border-t border-border pt-4 font-mono text-xs">
                  <button
                    type="button"
                    disabled={offset === 0}
                    onClick={() => applyFilters(Math.max(0, offset - PAGE_SIZE))}
                    className="rounded border border-border-strong px-3 py-1 text-text disabled:opacity-40"
                  >
                    &larr; Previous
                  </button>
                  <span className="text-text-muted">
                    Showing {offset + 1}&ndash;{Math.min(offset + PAGE_SIZE, total)} of {total}
                  </span>
                  <button
                    type="button"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => applyFilters(offset + PAGE_SIZE)}
                    className="rounded border border-border-strong px-3 py-1 text-text disabled:opacity-40"
                  >
                    Next &rarr;
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1040px] py-8 font-mono text-xs text-text-muted">
          Loading search...
        </div>
      }
    >
      <SearchPageInner />
    </Suspense>
  );
}
