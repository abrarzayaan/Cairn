"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchHit, searchNotes } from "@/lib/api";

const PAGE_SIZE = 20;

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialQ = searchParams.get("q") || "";
  const initialTag = searchParams.get("tag") || "";
  const initialAuthor = searchParams.get("author") || "";
  const initialScope = searchParams.get("scope") === "mine" ? "mine" : "all";
  const initialOffset = Math.max(0, Number(searchParams.get("offset") || "0") || 0);

  const [q, setQ] = useState(initialQ);
  const [tag, setTag] = useState(initialTag);
  const [author, setAuthor] = useState(initialAuthor);
  const [scope, setScope] = useState<"all" | "mine">(initialScope);
  const [offset, setOffset] = useState(initialOffset);

  const [results, setResults] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQ(searchParams.get("q") || "");
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
          tag: initialTag || undefined,
          author: initialAuthor || undefined,
          scope: initialScope,
          limit: PAGE_SIZE,
          offset: initialOffset,
        });
        if (!cancelled) {
          setResults(res.results);
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
  }, [initialQ, initialTag, initialAuthor, initialScope, initialOffset]);

  const applyFilters = (nextOffset = 0) => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (tag.trim()) sp.set("tag", tag.trim().replace(/^#/, ""));
    if (author.trim()) sp.set("author", author.trim().replace(/^@/, ""));
    if (scope === "mine") sp.set("scope", "mine");
    if (nextOffset > 0) sp.set("offset", String(nextOffset));
    router.push(`/search?${sp.toString()}`);
  };

  return (
    <div className="mx-auto max-w-[68ch] py-8">
      <h1 className="mb-6 font-sans text-2xl font-semibold tracking-tight text-text">
        Search
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters(0);
        }}
        className="mb-6 space-y-3 rounded border border-border bg-bg-subtle p-4"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles, content, or tags..."
            className="w-full rounded border border-border-strong bg-bg px-3 py-1.5 font-mono text-sm text-text focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex items-center rounded border border-text bg-text px-4 py-1.5 text-xs font-medium text-bg hover:border-text-muted hover:bg-text-muted"
          >
            Search
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Filter by tag"
            className="rounded border border-border-strong bg-bg px-2.5 py-1 font-mono text-xs text-text focus:border-accent focus:outline-none"
          />
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Filter by author"
            className="rounded border border-border-strong bg-bg px-2.5 py-1 font-mono text-xs text-text focus:border-accent focus:outline-none"
          />
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value === "mine" ? "mine" : "all")}
            className="rounded border border-border-strong bg-bg px-2.5 py-1 font-mono text-xs text-text focus:border-accent focus:outline-none"
          >
            <option value="all">All visible notes</option>
            <option value="mine">Only my notes</option>
          </select>
        </div>
      </form>

      {error && (
        <p className="mb-4 font-mono text-xs text-warn">{error}</p>
      )}

      {loading ? (
        <p className="font-mono text-sm text-text-muted">Searching...</p>
      ) : results.length === 0 ? (
        <p className="font-mono text-sm text-text-muted">No matching notes found.</p>
      ) : (
        <>
          <p className="mb-4 font-mono text-xs text-text-muted">
            Showing {offset + 1}&ndash;{Math.min(offset + results.length, total)} of {total}
          </p>

          <ul className="divide-y divide-border border-t border-b border-border">
            {results.map((hit) => (
              <li key={hit.id} className="py-4">
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <Link
                    href={`/u/${hit.author_username}/${hit.slug}`}
                    className="font-sans text-lg font-medium text-accent hover:underline"
                  >
                    {hit.title}
                  </Link>
                  <span className="shrink-0 font-mono text-xs text-text-muted">
                    @{hit.author_username}
                    {hit.visibility === "private" && (
                      <span className="ml-2 text-warn">private</span>
                    )}
                  </span>
                </div>
                {hit.snippet && (
                  <p className="mb-2 text-sm text-text-muted">{hit.snippet}</p>
                )}
                {hit.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 font-mono text-xs">
                    {hit.tags.map((t) => (
                      <Link
                        key={t}
                        href={`/tags/${encodeURIComponent(t)}`}
                        className="text-text-muted hover:text-accent"
                      >
                        #{t}
                      </Link>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-center justify-between font-mono text-xs">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => applyFilters(Math.max(0, offset - PAGE_SIZE))}
              className="rounded border border-border-strong px-3 py-1.5 text-text disabled:opacity-40"
            >
              &larr; Previous
            </button>
            <button
              type="button"
              disabled={offset + results.length >= total}
              onClick={() => applyFilters(offset + PAGE_SIZE)}
              className="rounded border border-border-strong px-3 py-1.5 text-text disabled:opacity-40"
            >
              Next &rarr;
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[68ch] py-8 font-mono text-sm text-text-muted">
          Loading search...
        </div>
      }
    >
      <SearchPageInner />
    </Suspense>
  );
}

