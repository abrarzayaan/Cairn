import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Metadata } from "next";
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Lock } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import NoteContent from "@/components/NoteContent";
import NoteOwnerActions from "@/components/NoteOwnerActions";
import OnThisPageToc from "@/components/OnThisPageToc";
import ReportButton from "@/components/ReportButton";
import { ChapterRef } from "@/lib/api";

interface PageProps {
  params: Promise<{
    user: string;
    slug: string;
  }>;
}

interface PrereqItem {
  key: string;
  title: string;
  slug: string | null;
  author_username: string | null;
  status: string;
}

interface BacklinkItem {
  id: number;
  title: string;
  slug: string;
  author_username: string;
  link_type: string;
  summary: string;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { user, slug } = await params;
  return {
    title: `${slug} by @${user} · Cairn`,
  };
}

export default async function NotePage({ params }: PageProps) {
  const { user, slug } = await params;
  const backendUrl =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.BACKEND_URL ||
    "http://127.0.0.1:8000";
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let res;
  try {
    res = await fetch(`${backendUrl}/api/v1/notes/by-slug/${user}/${slug}`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
  } catch {
    notFound();
  }

  if (res.status === 404 || !res.ok) {
    notFound();
  }

  const data = await res.json();
  const note = data.note;
  const directPrereqs: PrereqItem[] = data.direct_prereqs || [];
  const chapters: ChapterRef[] = data.chapters || [];
  const prevChapter: ChapterRef | null = data.prev_chapter || null;
  const nextChapter: ChapterRef | null = data.next_chapter || null;

  // Handle slug history redirect
  if (data.redirected && note.slug !== slug) {
    redirect(`/u/${user}/${note.slug}`);
  }

  // Fetch viewer-filtered backlinks
  let backlinks: BacklinkItem[] = [];
  try {
    const blRes = await fetch(`${backendUrl}/api/v1/notes/${note.id}/backlinks`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (blRes.ok) {
      backlinks = await blRes.json();
    }
  } catch {
    // Backlinks fail gracefully
  }

  const isPrivate = note.visibility === "private";
  const updatedDate = new Date(note.updated_at).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const bookSidebarContent = note.book ? (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-[10px] text-accent">
          {note.book.category.name}
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          {chapters.length} {chapters.length === 1 ? "ch" : "chs"}
        </span>
      </div>

      <Link
        href={`/u/${note.author_username}/books/${note.book.slug}`}
        className="flex items-start gap-1.5 font-sans text-sm font-semibold text-text hover:text-accent hover:no-underline"
      >
        <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <span>{note.book.title}</span>
      </Link>

      <ol className="max-h-[420px] space-y-0.5 overflow-y-auto border-t border-border pt-2">
        {chapters.map((ch) => {
          const isCurrent = ch.id === note.id;
          return (
            <li key={ch.id}>
              <Link
                href={`/u/${note.author_username}/${ch.slug}`}
                className={`flex items-center gap-2 rounded-r px-2.5 py-1.5 text-xs transition-colors hover:no-underline ${
                  isCurrent
                    ? "border-l-2 border-accent bg-bg font-semibold text-text"
                    : "border-l-2 border-transparent text-text-muted hover:bg-bg/60 hover:text-text"
                }`}
              >
                <span className="font-mono text-[11px] opacity-75">
                  {String(ch.sequence).padStart(2, "0")}
                </span>
                <span className="flex-1 truncate">{ch.title}</span>
                {ch.visibility === "private" && (
                  <Lock className="h-3 w-3 shrink-0 text-warn" />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  ) : null;

  return (
    <div className="mx-auto grid max-w-[1360px] grid-cols-1 gap-8 lg:grid-cols-[260px_minmax(0,1fr)_230px] lg:items-start">
      {/* LEFT RAIL: Book Sequence TOC & Prerequisites */}
      <aside className="space-y-4 lg:sticky lg:top-16">
        {/* Mobile Collapsible Drawer for Book TOC */}
        {note.book && (
          <details className="rounded border border-border bg-bg-subtle p-3.5 lg:hidden">
            <summary className="cursor-pointer list-none font-mono text-xs font-semibold text-text">
              Book Contents: {note.book.title} (Ch. {String(note.sequence).padStart(2, "0")})
            </summary>
            <div className="mt-3">{bookSidebarContent}</div>
          </details>
        )}

        <div className="hidden rounded border border-border bg-bg-subtle p-3.5 lg:block">
          <div className="mb-3 flex items-center justify-between font-mono text-xs">
            <Link
              href={`/u/${note.author_username}`}
              className="text-text-muted hover:text-text"
            >
              &larr; @{note.author_username}
            </Link>
            <CopyLinkButton />
          </div>

          {bookSidebarContent}

          {directPrereqs.length > 0 ? (
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  Read first
                </h2>
                <Link
                  href={`/u/${user}/${note.slug}/path`}
                  className="font-mono text-[11px] text-accent hover:underline"
                >
                  Full path &rarr;
                </Link>
              </div>
              <ol className="space-y-1.5 text-xs">
                {directPrereqs.map((prereq, idx) => (
                  <li key={prereq.key} className="flex items-start gap-2">
                    <span className="font-mono text-[11px] text-text-muted">
                      {idx + 1}.
                    </span>
                    {prereq.status === "ok" &&
                    prereq.slug &&
                    prereq.author_username ? (
                      <Link
                        href={`/u/${prereq.author_username}/${prereq.slug}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {prereq.title}
                      </Link>
                    ) : prereq.status === "private" ? (
                      <span className="font-mono text-warn">Private note</span>
                    ) : (
                      <span className="text-text-muted">
                        {prereq.title}{" "}
                        <span className="font-mono text-[10px]">(missing)</span>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            !note.book && (
              <div className="mt-3 border-t border-border pt-3 font-mono text-[11px] text-text-muted">
                No prerequisites &middot; standalone note
              </div>
            )
          )}
        </div>
      </aside>

      {/* CENTER: Editorial Documentation Content */}
      <article className="min-w-0 max-w-[72ch] lg:mx-auto lg:w-full">
        {/* BREADCRUMB */}
        <nav className="mb-3 flex flex-wrap items-center gap-1.5 font-mono text-xs text-text-muted">
          <Link href="/" className="hover:text-text">
            Docs
          </Link>
          {note.book ? (
            <>
              <ChevronRight className="h-3 w-3" />
              <Link
                href={`/search?type=books&category=${encodeURIComponent(
                  note.book.category.slug
                )}`}
                className="hover:text-text"
              >
                {note.book.category.name}
              </Link>
              <ChevronRight className="h-3 w-3" />
              <Link
                href={`/u/${note.author_username}/books/${note.book.slug}`}
                className="text-accent hover:underline"
              >
                {note.book.title}
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-text">
                Ch. {String(note.sequence).padStart(2, "0")}
              </span>
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3" />
              <Link href={`/u/${note.author_username}`} className="hover:text-text">
                @{note.author_username}
              </Link>
            </>
          )}
        </nav>

        <header className="mb-6 border-b border-border pb-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-xs">
            <span
              className={`rounded border px-1.5 py-0.5 text-[11px] ${
                isPrivate
                  ? "border-warn/40 bg-bg-subtle text-warn"
                  : "border-ok/30 bg-bg-subtle text-ok"
              }`}
            >
              {note.visibility}
            </span>
            <span className="text-text-muted">updated {updatedDate}</span>
            <NoteOwnerActions
              authorUsername={note.author_username}
              slug={note.slug}
            />
          </div>

          <h1 className="mb-3 font-sans text-3xl font-semibold tracking-tight text-text sm:text-4xl">
            {note.title}
          </h1>

          {note.tags && note.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 font-mono text-xs">
              {note.tags.map((tag: string) => (
                <Link
                  key={tag}
                  href={`/tags/${encodeURIComponent(tag)}`}
                  className="rounded border border-border bg-bg-subtle px-2 py-0.5 text-text-muted hover:border-accent hover:text-accent hover:no-underline"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}
        </header>

        {note.moderation === "hidden" && (
          <div className="mb-6 rounded border border-warn bg-bg-subtle p-4 font-mono text-xs text-warn">
            <p className="font-semibold">
              This note has been hidden by a moderator and is not visible to
              others.
            </p>
            {note.moderation_note && (
              <p className="mt-1 text-text-muted">
                Reason: {note.moderation_note}
              </p>
            )}
          </div>
        )}

        <NoteContent html={note.content_html} backlinks={[]} />

        {/* PREV / NEXT CHAPTER NAVIGATION */}
        {note.book && (prevChapter || nextChapter) && (
          <nav
            aria-label="Chapter Navigation"
            className="mt-10 grid grid-cols-1 gap-3 border-t border-border pt-6 sm:grid-cols-2"
          >
            {prevChapter ? (
              <Link
                href={`/u/${note.author_username}/${prevChapter.slug}`}
                className="group flex flex-col rounded-md border border-border bg-bg-subtle p-3.5 transition-colors hover:border-accent hover:no-underline"
              >
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-text-muted">
                  <ArrowLeft className="h-3 w-3" />
                  Previous · Ch. {String(prevChapter.sequence).padStart(2, "0")}
                </span>
                <span className="mt-1 font-sans text-sm font-semibold text-text group-hover:text-accent">
                  {prevChapter.title}
                </span>
              </Link>
            ) : (
              <div />
            )}

            {nextChapter ? (
              <Link
                href={`/u/${note.author_username}/${nextChapter.slug}`}
                className="group flex flex-col items-end rounded-md border border-border bg-bg-subtle p-3.5 text-right transition-colors hover:border-accent hover:no-underline"
              >
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-text-muted">
                  Next · Ch. {String(nextChapter.sequence).padStart(2, "0")}
                  <ArrowRight className="h-3 w-3" />
                </span>
                <span className="mt-1 font-sans text-sm font-semibold text-text group-hover:text-accent">
                  {nextChapter.title}
                </span>
              </Link>
            ) : (
              <div />
            )}
          </nav>
        )}

        {note.visibility === "public" && (
          <footer className="mt-8 flex items-center justify-between border-t border-border pt-4 font-mono text-xs text-text-muted">
            <Link
              href={`/u/${user}/${note.slug}/path`}
              className="text-accent hover:underline"
            >
              Open Reading Path &rarr;
            </Link>
            <ReportButton
              noteId={note.id}
              authorUsername={note.author_username}
            />
          </footer>
        )}
      </article>

      {/* RIGHT RAIL: On This Page & Backlinks */}
      <aside className="space-y-4 lg:sticky lg:top-16">
        <OnThisPageToc html={note.content_html} />

        <div className="rounded border border-border bg-bg p-4">
          <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
            Referenced by ({backlinks.length})
          </h2>
          {backlinks.length === 0 ? (
            <p className="font-mono text-xs text-text-muted">
              No other notes link here yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {backlinks.map((item) => (
                <li
                  key={item.id}
                  className="rounded border border-border bg-bg-subtle p-2.5"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Link
                      href={`/u/${item.author_username}/${item.slug}`}
                      className="text-xs font-semibold text-accent hover:underline"
                    >
                      {item.title}
                    </Link>
                    <span className="rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                      {item.link_type}
                    </span>
                  </div>
                  {item.summary && (
                    <p className="line-clamp-2 text-xs text-text-muted">
                      {item.summary}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
