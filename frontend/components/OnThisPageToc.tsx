"use client";

import { useEffect, useState } from "react";

interface HeadingItem {
  id: string;
  text: string;
  level: 2 | 3;
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function OnThisPageToc({ html }: { html: string }) {
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const container = document.querySelector(".prose-cairn");
    if (!container) return;

    const usedIds = new Set<string>();
    const found: HeadingItem[] = [];
    container.querySelectorAll("h2, h3").forEach((el, index) => {
      const text = (el.textContent || "").trim();
      if (!text) return;
      let id = el.getAttribute("id") || slugifyHeading(text) || `section-${index + 1}`;
      if (usedIds.has(id)) {
        id = `${id}-${index + 1}`;
      }
      usedIds.add(id);
      el.setAttribute("id", id);
      found.push({
        id,
        text,
        level: el.tagName === "H3" ? 3 : 2,
      });
    });

    setHeadings(found);
    if (found.length > 0) {
      setActiveId(found[0].id);
    }
  }, [html]);

  if (headings.length === 0) {
    return null;
  }

  return (
    <div className="rounded border border-border bg-bg p-4">
      <h2 className="mb-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
        On this page
      </h2>
      <ul className="space-y-1.5 text-xs">
        {headings.map((h) => (
          <li key={h.id} className={h.level === 3 ? "pl-3" : ""}>
            <a
              href={`#${h.id}`}
              onClick={() => setActiveId(h.id)}
              className={`block truncate py-0.5 transition-colors hover:text-accent hover:no-underline ${
                activeId === h.id
                  ? "font-medium text-accent"
                  : "text-text-muted"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

