"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileText, FolderKanban, User as UserIcon } from "lucide-react";
import {
  BookSummary,
  Category,
  SearchHit,
  searchNotes,
  UserSearchHit,
} from "@/lib/api";

interface SearchPaletteProps {
  currentUsername?: string | null;
  open: boolean;
  onClose: () => void;
}

type PaletteEntry =
  | { kind: "book"; href: string; item: BookSummary }
  | { kind: "note"; href: string; item: SearchHit }
  | { kind: "category"; href: string; item: Category }
  | { kind: "user"; href: string; item: UserSearchHit };

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accent-bg text-text">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export default function SearchPalette({
  currentUsername,
  open,
  onClose,
}: SearchPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState("");
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<UserSearchHit[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      setQuery("");
      setBooks([]);
      setResults([]);
      setCategories([]);
      setUsers([]);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchNotes({ q: query, limit: 6 });
        if (!cancelled) {
          setBooks((res.books || []).slice(0, 4));
          setResults(res.results || []);
          setCategories((res.categories || []).slice(0, 3));
          setUsers((res.users || []).slice(0, 3));
          setActiveIndex(0);
        }
      } catch {
        if (!cancelled) {
          setBooks([]);
          setResults([]);
          setCategories([]);
          setUsers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const entries: PaletteEntry[] = useMemo(() => {
    const out: PaletteEntry[] = [];
    books.forEach((b) =>
      out.push({
        kind: "book",
        href: `/u/${b.author_username}/books/${b.slug}`,
        item: b,
      })
    );
    results.forEach((n) =>
      out.push({
        kind: "note",
        href: `/u/${n.author_username}/${n.slug}`,
        item: n,
      })
    );
    categories.forEach((c) =>
      out.push({
        kind: "category",
        href: `/search?type=books&category=${encodeURIComponent(c.slug)}`,
        item: c,
      })
    );
    users.forEach((u) =>
      out.push({
        kind: "user",
        href: `/u/${u.username}`,
        item: u,
      })
    );
    return out;
  }, [books, results, categories, users]);

  if (!open) return null;

  const navigateTo = (href: string) => {
    onClose();
    router.push(href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (entries.length ? (prev + 1) % entries.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        entries.length ? (prev - 1 + entries.length) % entries.length : 0
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (entries[activeIndex]) {
        navigateTo(entries[activeIndex].href);
      } else if (query.trim()) {
        navigateTo(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-16 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Search Cairn Docs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-md border border-border-strong bg-bg shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center border-b border-border px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search books, chapters, categories, or @developer..."
            className="w-full bg-transparent font-mono text-sm text-text placeholder:text-text-muted focus:outline-none"
          />
          <kbd className="ml-2 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
            ESC
          </kbd>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="px-4 py-6 text-center font-mono text-xs text-text-muted">
              Searching documentation...
            </div>
          ) : entries.length === 0 ? (
            <div className="px-4 py-6 text-center font-mono text-xs text-text-muted">
              {query.trim()
                ? `No matching docs for "${query}".`
                : "Type to search books, chapters, categories, or developers."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((entry, idx) => {
                const isSelected = idx === activeIndex;
                return (
                  <li key={`${entry.kind}-${idx}-${entry.href}`}>
                    <button
                      type="button"
                      onClick={() => navigateTo(entry.href)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected ? "bg-bg-subtle" : "bg-bg"
                      }`}
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className="mt-0.5 shrink-0 text-accent">
                          {entry.kind === "book" && <BookOpen className="h-4 w-4" />}
                          {entry.kind === "note" && <FileText className="h-4 w-4" />}
                          {entry.kind === "category" && (
                            <FolderKanban className="h-4 w-4" />
                          )}
                          {entry.kind === "user" && <UserIcon className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                          {entry.kind === "book" && (
                            <>
                              <div className="truncate font-sans text-sm font-medium text-text">
                                <HighlightMatch text={entry.item.title} query={query} />
                              </div>
                              <div className="font-mono text-[11px] text-text-muted">
                                Book &middot; {entry.item.category.name} &middot;{" "}
                                {entry.item.chapter_count} ch &middot; @
                                {entry.item.author_username}
                              </div>
                            </>
                          )}
                          {entry.kind === "note" && (
                            <>
                              <div className="truncate font-sans text-sm font-medium text-text">
                                <HighlightMatch text={entry.item.title} query={query} />
                              </div>
                              <div className="font-mono text-[11px] text-text-muted">
                                {entry.item.book_title
                                  ? `${entry.item.book_title} · Ch. ${String(
                                      entry.item.sequence || 1
                                    ).padStart(2, "0")}`
                                  : "Note"}{" "}
                                &middot; @{entry.item.author_username}
                              </div>
                            </>
                          )}
                          {entry.kind === "category" && (
                            <>
                              <div className="truncate font-sans text-sm font-medium text-text">
                                <HighlightMatch text={entry.item.name} query={query} />
                              </div>
                              <div className="font-mono text-[11px] text-text-muted">
                                Category &middot; {entry.item.book_count} books
                              </div>
                            </>
                          )}
                          {entry.kind === "user" && (
                            <>
                              <div className="truncate font-mono text-sm font-medium text-text">
                                @<HighlightMatch text={entry.item.username} query={query} />
                              </div>
                              <div className="font-mono text-[11px] text-text-muted">
                                Developer &middot; {entry.item.public_book_count} books &middot;{" "}
                                {entry.item.public_note_count} notes
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <span className="shrink-0 rounded border border-border bg-bg-subtle px-1.5 py-0.5 font-mono text-[10px] uppercase text-text-muted">
                        {entry.kind}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-bg-subtle px-4 py-2 font-mono text-[11px] text-text-muted">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-border bg-bg px-1">&uarr;&darr;</kbd>{" "}
              move
            </span>
            <span>
              <kbd className="rounded border border-border bg-bg px-1">Enter</kbd>{" "}
              open
            </span>
          </div>
          <div className="flex items-center gap-3">
            {currentUsername && (
              <button
                type="button"
                onClick={() => navigateTo(`/search?scope=mine`)}
                className="text-accent hover:underline"
              >
                My Docs
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                navigateTo(
                  query.trim()
                    ? `/search?q=${encodeURIComponent(query.trim())}`
                    : "/search"
                )
              }
              className="text-text hover:underline"
            >
              Advanced search &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
