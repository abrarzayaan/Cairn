"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as Avatar from "@radix-ui/react-avatar";
import { FolderKanban, Search } from "lucide-react";
import BookCard from "@/components/BookCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
  const initialOffset = Math.max(
    0,
    Number(searchParams.get("offset") || "0") || 0,
  );

  const [q, setQ] = useState(initialQ);
  const [searchType, setSearchType] = useState<SearchType>(
    ["all", "books", "notes", "categories", "users"].includes(initialType)
      ? initialType
      : "all",
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
    if (scope === "mine") {
      fetchCategories().then(setAllCategories);
    } else if (author.trim()) {
      fetchCategories(author.trim().replace(/^@/, "")).then(setAllCategories);
    } else {
      setAllCategories([]);
    }
  }, [scope, author]);

  useEffect(() => {
    const nextType = (searchParams.get("type") as SearchType) || "all";
    setQ(searchParams.get("q") || "");
    setSearchType(
      ["all", "books", "notes", "categories", "users"].includes(nextType)
        ? nextType
        : "all",
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

  const applyFilters = (next: {
    q?: string;
    type?: SearchType;
    category?: string;
    tag?: string;
    author?: string;
    scope?: "all" | "mine";
    offset?: number;
  }) => {
    const sp = new URLSearchParams();
    const nq = (next.q ?? q).trim();
    const nt = next.type ?? searchType;
    const nc = (next.category ?? category).trim();
    const ntag = (next.tag ?? tag).trim().replace(/^#/, "");
    const na = (next.author ?? author).trim().replace(/^@/, "");
    const ns = next.scope ?? scope;
    const no = next.offset ?? 0;

    if (nq) sp.set("q", nq);
    if (nt !== "all") sp.set("type", nt);
    if (nc) sp.set("category", nc);
    if (ntag) sp.set("tag", ntag);
    if (na) sp.set("author", na);
    if (ns === "mine") sp.set("scope", "mine");
    if (no > 0) sp.set("offset", String(no));

    router.push(`/search${sp.toString() ? `?${sp.toString()}` : ""}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters({ offset: 0 });
  };

  const hasAny =
    books.length > 0 ||
    results.length > 0 ||
    categories.length > 0 ||
    users.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* TOP SEARCH BAR */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search published books, chapters, topics, or @developers..."
            className="h-10 w-full rounded-md border border-border-default bg-surface-0 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none"
          />
        </div>
        <Button type="submit" size="lg" variant="primary">
          Search
        </Button>
      </form>

      {/* TWO-COLUMN: LEFT FILTER SIDEBAR | RIGHT RESULTS */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-6 rounded-md bg-surface-1 p-4 lg:sticky lg:top-16">
          {/* Scope */}
          <div className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Scope
            </h2>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { key: "all", label: "Published" },
                  { key: "mine", label: "My Desk" },
                ] as const
              ).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => applyFilters({ scope: s.key, offset: 0 })}
                  className={`rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    scope === s.key
                      ? "bg-accent text-white"
                      : "bg-surface-0 text-text-secondary hover:bg-surface-2"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Type */}
          <div className="space-y-1.5 border-t border-border-subtle pt-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Type
            </h2>
            {(
              [
                { key: "all", label: "All results" },
                { key: "books", label: "Books" },
                { key: "notes", label: "Chapters & Notes" },
                { key: "users", label: "Developers" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => applyFilters({ type: t.key, offset: 0 })}
                className={`flex w-full items-center rounded-sm px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                  searchType === t.key
                    ? "bg-surface-2 text-text-primary"
                    : "text-text-secondary hover:bg-surface-2/60 hover:text-text-primary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tag & Author Filters */}
          <div className="space-y-3 border-t border-border-subtle pt-4">
            <div>
              <label
                htmlFor="filter-tag"
                className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary"
              >
                Tag
              </label>
              <input
                id="filter-tag"
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters({ offset: 0 });
                }}
                placeholder="e.g. javascript"
                className="h-8 w-full rounded-sm border border-border-default bg-surface-0 px-2.5 text-xs text-text-primary focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="filter-author"
                className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary"
              >
                Author
              </label>
              <input
                id="filter-author"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters({ offset: 0 });
                }}
                placeholder="e.g. rahim"
                className="h-8 w-full rounded-sm border border-border-default bg-surface-0 px-2.5 text-xs text-text-primary focus:border-accent focus:outline-none"
              />
            </div>

            {allCategories.length > 0 && (
              <div>
                <label
                  htmlFor="filter-cat"
                  className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary"
                >
                  Category
                </label>
                <select
                  id="filter-cat"
                  value={category}
                  onChange={(e) =>
                    applyFilters({ category: e.target.value, offset: 0 })
                  }
                  className="h-8 w-full rounded-sm border border-border-default bg-surface-0 px-2 text-xs text-text-primary focus:border-accent focus:outline-none"
                >
                  <option value="">All categories</option>
                  {allCategories.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={() => applyFilters({ offset: 0 })}
            >
              Apply filters
            </Button>
          </div>
        </aside>

        {/* RIGHT RESULTS AREA */}
        <div className="min-w-0 space-y-8">
          {error && (
            <div className="rounded-md border border-status-danger/30 bg-surface-1 p-4 text-xs text-status-danger">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-24 animate-pulse rounded-md bg-surface-1"
                />
              ))}
            </div>
          ) : !hasAny ? (
            <Card variant="ghost" className="p-10 text-center">
              <p className="text-sm font-medium text-text-primary">
                {initialQ
                  ? `Nothing matches "${initialQ}".`
                  : "No matching results found."}
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                Try fewer words or clear one of your filters.
              </p>
            </Card>
          ) : (
            <>
              {/* DEVELOPER PROFILES */}
              {users.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-text-primary">
                    Developers ({users.length})
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {users.map((u) => (
                      <Link
                        key={u.username}
                        href={`/u/${u.username}`}
                        className="block hover:no-underline"
                      >
                        <Card variant="interactive" className="flex items-start gap-3.5 p-4">
                          <Avatar.Root className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-light text-xs font-semibold text-accent">
                            <Avatar.Fallback delayMs={0}>
                              {u.username.slice(0, 2).toUpperCase()}
                            </Avatar.Fallback>
                          </Avatar.Root>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-semibold text-text-primary">
                                @{u.username}
                              </span>
                              <Badge variant="success" size="sm">
                                {u.published_book_count} books &middot;{" "}
                                {u.published_note_count} notes
                              </Badge>
                            </div>
                            {u.bio && (
                              <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                                {u.bio}
                              </p>
                            )}
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* BOOKS */}
              {books.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-text-primary">
                    Books ({books.length})
                  </h2>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {books.map((book) => (
                      <BookCard key={book.id} book={book} />
                    ))}
                  </div>
                </section>
              )}

              {/* CATEGORIES */}
              {categories.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-text-primary">
                    Categories ({categories.length})
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          applyFilters({ category: c.slug, offset: 0 })
                        }
                        className="inline-flex items-center gap-1.5 rounded-sm border border-border-default bg-surface-0 px-3 py-1.5 text-xs font-medium text-text-primary hover:border-border-strong hover:bg-surface-1"
                      >
                        <FolderKanban className="h-3.5 w-3.5 text-accent" />
                        <span>{c.name}</span>
                        <span className="text-text-tertiary">
                          ({c.book_count})
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* NOTES */}
              {results.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-text-primary">
                      Chapters &amp; Notes ({total})
                    </h2>
                  </div>
                  <ul className="space-y-2.5">
                    {results.map((hit) => (
                      <li key={hit.id}>
                        <Card variant="interactive" className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/u/${hit.author_username}/${hit.slug}`}
                                className="text-base font-semibold text-text-primary hover:text-accent hover:no-underline"
                              >
                                {hit.title}
                              </Link>
                              {hit.book_title && hit.book_slug && (
                                <Link
                                  href={`/u/${hit.author_username}/books/${hit.book_slug}`}
                                  className="rounded-sm bg-accent-light px-2 py-0.5 text-xs font-medium text-accent hover:no-underline"
                                >
                                  {hit.book_title}
                                </Link>
                              )}
                            </div>
                            <Badge
                              variant={
                                hit.visibility === "private"
                                  ? "warning"
                                  : hit.is_published
                                  ? "success"
                                  : "outline"
                              }
                              size="sm"
                            >
                              {hit.visibility === "private"
                                ? "Private"
                                : hit.is_published
                                ? "Published"
                                : "Desk"}
                            </Badge>
                          </div>

                          {hit.snippet && (
                            <p className="mt-1.5 line-clamp-2 text-sm text-text-secondary">
                              {hit.snippet}
                            </p>
                          )}

                          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-text-tertiary">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/u/${hit.author_username}`}
                                className="font-medium text-text-secondary hover:text-accent hover:no-underline"
                              >
                                @{hit.author_username}
                              </Link>
                              {hit.tags.map((t) => (
                                <Link
                                  key={t}
                                  href={`/tags/${encodeURIComponent(t)}`}
                                  className="rounded-sm bg-surface-1 px-1.5 py-0.5 font-mono text-[11px] hover:text-accent hover:no-underline"
                                >
                                  #{t}
                                </Link>
                              ))}
                            </div>
                          </div>
                        </Card>
                      </li>
                    ))}
                  </ul>

                  {/* PAGINATION */}
                  {total > PAGE_SIZE && (
                    <div className="flex items-center justify-between pt-4">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={offset === 0}
                        onClick={() =>
                          applyFilters({
                            offset: Math.max(0, offset - PAGE_SIZE),
                          })
                        }
                      >
                        &larr; Previous
                      </Button>
                      <span className="text-xs text-text-tertiary">
                        Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)}{" "}
                        of {total}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={offset + PAGE_SIZE >= total}
                        onClick={() =>
                          applyFilters({ offset: offset + PAGE_SIZE })
                        }
                      >
                        Next &rarr;
                      </Button>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl py-12 text-center text-sm text-text-tertiary">
          Loading search...
        </div>
      }
    >
      <SearchPageInner />
    </Suspense>
  );
}
