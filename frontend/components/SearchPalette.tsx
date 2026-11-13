"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchHit, searchNotes } from "@/lib/api";

interface SearchPaletteProps {
  currentUsername?: string | null;
  open: boolean;
  onClose: () => void;
}

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
  const [results, setResults] = useState<SearchHit[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchNotes({ q: query, limit: 8 });
        if (!cancelled) {
          setResults(res.results);
          setActiveIndex(0);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  if (!open) return null;

  const navigateToHit = (hit: SearchHit) => {
    onClose();
    router.push(`/u/${hit.author_username}/${hit.slug}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (results.length ? (prev + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        results.length ? (prev - 1 + results.length) % results.length : 0
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[activeIndex]) {
        navigateToHit(results[activeIndex]);
      } else if (query.trim()) {
        onClose();
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[14vh] px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search notes"
    >
      <div
        className="w-full max-w-[560px] border border-border-strong bg-bg"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center border-b border-border px-3 py-2.5">
          <span className="mr-2 font-mono text-sm text-text-muted">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes..."
            className="w-full bg-transparent font-mono text-sm text-text placeholder:text-text-muted focus:outline-none"
            aria-label="Search query"
          />
          {loading && (
            <span className="ml-2 font-mono text-xs text-text-muted">...</span>
          )}
        </div>

        <ul className="max-h-80 overflow-y-auto divide-y divide-border" role="listbox">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center font-mono text-xs text-text-muted">
              {loading ? "Searching..." : query ? "No matching notes." : "Type to search notes."}
            </li>
          ) : (
            results.map((hit, idx) => {
              const isOwn =
                currentUsername &&
                hit.author_username.toLowerCase() === currentUsername.toLowerCase();
              const metaLabel =
                hit.visibility === "private"
                  ? "private"
                  : hit.tags.length > 0
                  ? `#${hit.tags[0]}`
                  : "";

              return (
                <li
                  key={hit.id}
                  role="option"
                  aria-selected={idx === activeIndex}
                >
                  <button
                    type="button"
                    onClick={() => navigateToHit(hit)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${
                      idx === activeIndex ? "bg-bg-subtle" : "bg-bg"
                    }`}
                  >
                    <span className="truncate font-medium text-text">
                      <HighlightMatch text={hit.title} query={query} />
                    </span>
                    <span className="flex shrink-0 items-center gap-3 font-mono text-xs">
                      <span className="text-text-muted">
                        {isOwn ? "you" : hit.author_username}
                      </span>
                      <span
                        className={
                          hit.visibility === "private"
                            ? "text-warn"
                            : "text-text-muted"
                        }
                      >
                        {metaLabel}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="flex items-center justify-between border-t border-border bg-bg-subtle px-4 py-2 font-mono text-xs text-text-muted">
          <span>Enter open &nbsp; Up/Down move &nbsp; Esc close</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push(
                query.trim()
                  ? `/search?q=${encodeURIComponent(query.trim())}`
                  : "/search"
              );
            }}
            className="text-accent hover:underline"
          >
            All results &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

