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
    const elements: Element[] = [];

    container.querySelectorAll("h2, h3").forEach((el, index) => {
      const text = (el.textContent || "").trim();
      if (!text) return;
      let id =
        el.getAttribute("id") || slugifyHeading(text) || `section-${index + 1}`;
      if (usedIds.has(id)) {
        id = `${id}-${index + 1}`;
      }
      usedIds.add(id);
      el.setAttribute("id", id);
      elements.push(el);
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

    if (elements.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-72px 0px -70% 0px", threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [html]);

  if (headings.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
        On this page
      </h2>
      <ul className="space-y-1 text-xs">
        {headings.map((h) => (
          <li key={h.id} className={h.level === 3 ? "pl-3" : ""}>
            <a
              href={`#${h.id}`}
              onClick={() => setActiveId(h.id)}
              className={`block truncate py-1 transition-colors hover:text-accent hover:no-underline ${
                activeId === h.id
                  ? "font-medium text-accent"
                  : "text-text-tertiary"
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
