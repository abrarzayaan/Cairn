"use client";

import Link from "next/link";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import OnThisPageToc from "@/components/OnThisPageToc";
import { Badge } from "@/components/ui/Badge";

export interface BacklinkItem {
  id: number;
  title: string;
  slug: string;
  author_username: string;
  link_type: string;
  summary: string;
}

export default function NoteReaderRightRail({
  html,
  backlinks,
}: {
  html: string;
  backlinks: BacklinkItem[];
}) {
  return (
    <ScrollArea.Root className="max-h-[calc(100vh-5rem)] overflow-hidden">
      <ScrollArea.Viewport className="max-h-[calc(100vh-5rem)] pr-2">
        <div className="space-y-6">
          <OnThisPageToc html={html} />

          <div className="border-t border-border-subtle pt-4">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Backlinks ({backlinks.length})
            </h2>
            {backlinks.length === 0 ? (
              <p className="text-xs text-text-tertiary">
                No other notes link here yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {backlinks.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-md bg-surface-1 p-2.5 transition-colors hover:bg-surface-2"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <Link
                        href={`/u/${item.author_username}/${item.slug}`}
                        className="truncate text-xs font-medium text-text-primary hover:text-accent hover:no-underline"
                      >
                        {item.title}
                      </Link>
                      <Badge variant="outline" size="sm">
                        {item.link_type}
                      </Badge>
                    </div>
                    {item.summary && (
                      <p className="line-clamp-2 text-xs text-text-tertiary">
                        {item.summary}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        orientation="vertical"
        className="flex w-1.5 touch-none select-none p-0.5"
      >
        <ScrollArea.Thumb className="relative flex-1 rounded-full bg-border-default" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
