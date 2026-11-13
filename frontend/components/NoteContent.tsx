"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface BacklinkItem {
  id: number;
  title: string;
  slug: string;
  author_username: string;
  link_type: string;
  summary: string;
}

interface PreviewData {
  id: number;
  title: string;
  slug: string;
  author_username: string;
  summary: string;
  prereq_count: number;
}

interface NoteContentProps {
  html: string;
  backlinks: BacklinkItem[];
}

export default function NoteContent({ html, backlinks }: NoteContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const cacheRef = useRef<Record<string, PreviewData>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a.wikilink[data-note-id]") as HTMLElement | null;
      if (!target) return;

      const noteId = target.getAttribute("data-note-id");
      if (!noteId) return;

      const rect = target.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY + 8,
        left: Math.min(rect.left + window.scrollX, window.innerWidth - 320),
      });

      if (cacheRef.current[noteId]) {
        setPreview(cacheRef.current[noteId]);
        return;
      }

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/v1/notes/${noteId}/preview`, {
            credentials: "include",
          });
          if (res.ok) {
            const data: PreviewData = await res.json();
            cacheRef.current[noteId] = data;
            setPreview(data);
          }
        } catch {
          // Ignore network errors on hover preview
        }
      }, 150);
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a.wikilink[data-note-id]");
      if (!target) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setPreview(null);
      setCoords(null);
    };

    container.addEventListener("mouseover", handleMouseOver);
    container.addEventListener("mouseout", handleMouseOut);

    return () => {
      container.removeEventListener("mouseover", handleMouseOver);
      container.removeEventListener("mouseout", handleMouseOut);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [html]);

  return (
    <div className="relative">
      {html ? (
        <div
          ref={containerRef}
          className="prose-cairn"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="font-serif text-lg italic text-text-muted">Empty note.</p>
      )}

      {preview && coords && (
        <div
          role="tooltip"
          style={{ top: coords.top, left: coords.left }}
          className="fixed z-50 w-72 rounded-md border border-border-strong bg-bg p-3 shadow-lg"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-sans text-sm font-semibold text-text">
              {preview.title}
            </span>
            {preview.prereq_count > 0 && (
              <span className="rounded bg-bg-inset px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                {preview.prereq_count} prereq{preview.prereq_count > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="line-clamp-3 font-serif text-xs leading-relaxed text-text-muted">
            {preview.summary || "No summary available."}
          </p>
        </div>
      )}

      {backlinks.length > 0 && (
        <section className="mt-12 border-t border-border pt-6">
          <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
            Referenced by ({backlinks.length})
          </h2>
          <ul className="space-y-3">
            {backlinks.map((item) => (
              <li
                key={item.id}
                className="rounded border border-border bg-bg-subtle p-3 transition-colors hover:border-border-strong"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/u/${item.author_username}/${item.slug}`}
                    className="font-sans text-sm font-medium text-accent hover:underline"
                  >
                    {item.title}
                  </Link>
                  <span className="font-mono text-[11px] text-text-muted">
                    {item.link_type} &middot; @{item.author_username}
                  </span>
                </div>
                {item.summary && (
                  <p className="mt-1 line-clamp-2 font-serif text-xs text-text-muted">
                    {item.summary}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

