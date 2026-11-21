"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  BookOpen,
  FileText,
  FolderKanban,
  Search,
  User as UserIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/Badge";
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
      <mark className="rounded-[2px] bg-accent-light px-0.5 text-accent">
        {text.slice(idx, idx + q.length)}
      </mark>
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
      setTimeout(() => inputRef.current?.focus(), 20);
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
      }),
    );
    results.forEach((n) =>
      out.push({
        kind: "note",
        href: `/u/${n.author_username}/${n.slug}`,
        item: n,
      }),
    );
    categories.forEach((c) =>
      out.push({
        kind: "category",
        href: `/search?type=books&category=${encodeURIComponent(c.slug)}`,
        item: c,
      }),
    );
    users.forEach((u) =>
      out.push({
        kind: "user",
        href: `/u/${u.username}`,
        item: u,
      }),
    );
    return out;
  }, [books, results, categories, users]);

  const openEntry = (entry: PaletteEntry) => {
    onClose();
    router.push(entry.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (entries.length > 0) {
        setActiveIndex((prev) => (prev + 1) % entries.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (entries.length > 0) {
        setActiveIndex((prev) => (prev - 1 + entries.length) % entries.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (entries[activeIndex]) {
        openEntry(entries[activeIndex]);
      } else {
        onClose();
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    }
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-label="Search docs, books, and developers"
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 focus:outline-none"
        >
          <DialogPrimitive.Title className="sr-only">
            Search Cairn
          </DialogPrimitive.Title>
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="overflow-hidden rounded-lg border border-border-default bg-surface-0 shadow-2xl"
          >
            {/* Search Input */}
            <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-text-tertiary" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search books, chapters, topics, or @developers..."
                className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-disabled focus:outline-none"
                aria-label="Search query"
              />
              {loading && (
                <span className="shrink-0 text-xs text-text-tertiary">
                  Searching...
                </span>
              )}
            </div>

            {/* Results List */}
            <div
              role="listbox"
              className="max-h-[380px] overflow-y-auto p-1.5"
            >
              {entries.length === 0 && !loading ? (
                <div className="px-3 py-8 text-center text-xs text-text-tertiary">
                  {query.trim()
                    ? `No results for "${query.trim()}". Press Enter for full search.`
                    : "Start typing to search published books, notes, and developer profiles."}
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {entries.map((entry, idx) => {
                    const isActive = idx === activeIndex;
                    return (
                      <li
                        key={`${entry.kind}-${entry.href}`}
                        role="option"
                        aria-selected={isActive}
                      >
                        <button
                          type="button"
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => openEntry(entry)}
                          className={`flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm transition-colors ${
                            isActive
                              ? "bg-surface-2 text-text-primary"
                              : "text-text-secondary hover:bg-surface-1"
                          }`}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            {entry.kind === "book" && (
                              <BookOpen className="h-4 w-4 shrink-0 text-accent" />
                            )}
                            {entry.kind === "note" && (
                              <FileText className="h-4 w-4 shrink-0 text-text-tertiary" />
                            )}
                            {entry.kind === "category" && (
                              <FolderKanban className="h-4 w-4 shrink-0 text-accent" />
                            )}
                            {entry.kind === "user" && (
                              <UserIcon className="h-4 w-4 shrink-0 text-accent" />
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-text-primary">
                                {entry.kind === "book" && (
                                  <HighlightMatch
                                    text={entry.item.title}
                                    query={query}
                                  />
                                )}
                                {entry.kind === "note" && (
                                  <HighlightMatch
                                    text={entry.item.title}
                                    query={query}
                                  />
                                )}
                                {entry.kind === "category" && (
                                  <HighlightMatch
                                    text={entry.item.name}
                                    query={query}
                                  />
                                )}
                                {entry.kind === "user" && (
                                  <>
                                    @
                                    <HighlightMatch
                                      text={entry.item.username}
                                      query={query}
                                    />
                                  </>
                                )}
                              </div>

                              <div className="truncate text-xs text-text-tertiary">
                                {entry.kind === "book" && (
                                  <>
                                    {entry.item.category.name} &middot;{" "}
                                    {entry.item.chapter_count} chs &middot; @
                                    {entry.item.author_username ===
                                    currentUsername
                                      ? "you"
                                      : entry.item.author_username}
                                  </>
                                )}
                                {entry.kind === "note" && (
                                  <>
                                    {entry.item.book_title
                                      ? `${entry.item.book_title} · `
                                      : ""}
                                    @
                                    {entry.item.author_username ===
                                    currentUsername
                                      ? "you"
                                      : entry.item.author_username}
                                  </>
                                )}
                                {entry.kind === "category" && (
                                  <>{entry.item.book_count} books</>
                                )}
                                {entry.kind === "user" && (
                                  <>
                                    {entry.item.published_book_count} published
                                    books &middot;{" "}
                                    {entry.item.published_note_count} notes
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            {entry.kind === "book" && (
                              <Badge variant="info" size="sm">
                                Book
                              </Badge>
                            )}
                            {entry.kind === "note" &&
                              entry.item.visibility === "private" && (
                                <Badge variant="warning" size="sm">
                                  Private
                                </Badge>
                              )}
                            {entry.kind === "note" &&
                              entry.item.visibility === "public" &&
                              entry.item.tags[0] && (
                                <span className="font-mono text-[11px] text-text-tertiary">
                                  #{entry.item.tags[0]}
                                </span>
                              )}
                            {entry.kind === "user" && (
                              <Badge variant="outline" size="sm">
                                Dev
                              </Badge>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer Key Hints */}
            <div className="flex items-center justify-between border-t border-border-subtle bg-surface-1 px-4 py-2 text-[11px] text-text-tertiary">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="rounded border border-border-default bg-surface-0 px-1 py-0.5 font-mono text-[10px]">
                    Enter
                  </kbd>{" "}
                  open
                </span>
                <span>
                  <kbd className="rounded border border-border-default bg-surface-0 px-1 py-0.5 font-mono text-[10px]">
                    &uarr;&darr;
                  </kbd>{" "}
                  move
                </span>
                <span>
                  <kbd className="rounded border border-border-default bg-surface-0 px-1 py-0.5 font-mono text-[10px]">
                    Esc
                  </kbd>{" "}
                  close
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/search?q=${encodeURIComponent(query.trim())}`);
                }}
                className="font-medium text-accent hover:underline"
              >
                Full search &rarr;
              </button>
            </div>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
