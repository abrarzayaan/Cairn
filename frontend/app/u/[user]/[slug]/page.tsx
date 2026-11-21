import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Metadata } from "next";
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Lock } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import NoteContent from "@/components/NoteContent";
import NoteOwnerActions from "@/components/NoteOwnerActions";
import NoteReaderRightRail, {
  BacklinkItem,
} from "@/components/NoteReaderRightRail";
import ReadingProgressBar from "@/components/ReadingProgressBar";
import ReportButton from "@/components/ReportButton";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { user, slug } = await params;
  const backendUrl =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.BACKEND_URL ||
    "http://127.0.0.1:8000";

  try {
    // Always fetch anonymously so private/hidden notes never leak into meta tags
    const res = await fetch(
      `${backendUrl}/api/v1/notes/by-slug/${encodeURIComponent(user)}/${encodeURIComponent(slug)}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return {
        title: "Cairn",
        robots: { index: false, follow: false },
      };
    }
    const data = await res.json();
    const note = data.note;
    if (!note || note.visibility !== "public" || note.moderation === "hidden") {
      return {
        title: "Cairn",
        robots: { index: false, follow: false },
      };
    }

    const title = `${note.title} — @${note.author_username}`;
    const description =
      note.summary ||
      `Technical note "${note.title}" by @${note.author_username} on Cairn.`;
    const canonicalPath = `/u/${note.author_username}/${note.slug}`;

    return {
      title,
      description,
      alternates: {
        canonical: canonicalPath,
      },
      robots: note.is_published
        ? { index: true, follow: true }
        : { index: false, follow: false },
      openGraph: {
        type: "article",
        siteName: "Cairn",
        title,
        description,
        url: canonicalPath,
      },
    };
  } catch {
    return {
      title: "Cairn",
    };
  }
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="info" size="sm">
          {note.book.category.name}
        </Badge>
        <span className="text-xs text-text-tertiary">
          {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}
        </span>
      </div>

      <Link
        href={`/u/${note.author_username}/books/${note.book.slug}`}
        className="flex items-start gap-2 text-sm font-semibold text-text-primary hover:text-accent hover:no-underline"
      >
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <span>{note.book.title}</span>
      </Link>

      <ol className="max-h-[420px] space-y-0.5 overflow-y-auto border-t border-border-subtle pt-2.5">
        {chapters.map((ch) => {
          const isCurrent = ch.id === note.id;
          return (
            <li key={ch.id}>
              <Link
                href={`/u/${note.author_username}/${ch.slug}`}
                className={`flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs transition-colors hover:no-underline ${
                  isCurrent
                    ? "bg-accent-light font-medium text-accent"
                    : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                }`}
              >
                <span className="font-mono text-[11px] opacity-70">
                  {String(ch.sequence).padStart(2, "0")}
                </span>
                <span className="flex-1 truncate">{ch.title}</span>
                {ch.visibility === "private" && (
                  <Lock className="h-3 w-3 shrink-0 text-status-warning" />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  ) : null;

  return (
    <>
      <ReadingProgressBar />
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)_220px] lg:items-start">
        {/* LEFT RAIL: Book Sequence TOC & Prerequisites */}
        <aside className="space-y-4 lg:sticky lg:top-16">
          {/* Mobile Collapsible Drawer for Book TOC */}
          {note.book && (
            <details className="rounded-md bg-surface-1 p-3.5 lg:hidden">
              <summary className="cursor-pointer list-none text-xs font-semibold text-text-primary">
                Book Contents: {note.book.title} (Ch.{" "}
                {String(note.sequence).padStart(2, "0")})
              </summary>
              <div className="mt-3">{bookSidebarContent}</div>
            </details>
          )}

          <div className="hidden rounded-md bg-surface-1 p-3.5 lg:block">
            <div className="mb-3 flex items-center justify-between text-xs">
              <Link
                href={`/u/${note.author_username}`}
                className="font-medium text-text-secondary hover:text-text-primary hover:no-underline"
              >
                &larr; @{note.author_username}
              </Link>
              <CopyLinkButton />
            </div>

            {bookSidebarContent}

            {directPrereqs.length > 0 ? (
              <div className="mt-4 border-t border-border-subtle pt-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Read first
                  </h2>
                  <Link
                    href={`/u/${user}/${note.slug}/path`}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Full path &rarr;
                  </Link>
                </div>
                <ol className="space-y-1.5 text-xs">
                  {directPrereqs.map((prereq, idx) => (
                    <li key={prereq.key} className="flex items-start gap-2">
                      <span className="font-mono text-[11px] text-text-tertiary">
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
                        <span className="text-status-warning">Private note</span>
                      ) : (
                        <span className="text-text-tertiary">
                          {prereq.title}{" "}
                          <span className="text-[11px]">(missing)</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              !note.book && (
                <div className="mt-3 border-t border-border-subtle pt-3 text-xs text-text-tertiary">
                  No prerequisites &middot; standalone note
                </div>
              )
            )}
          </div>
        </aside>

        {/* CENTER: Editorial Documentation Content */}
        <article className="min-w-0 max-w-[680px] lg:mx-auto lg:w-full">
          {/* BREADCRUMB */}
          <nav
            aria-label="Breadcrumb"
            className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-text-tertiary"
          >
            <Link
              href={`/u/${note.author_username}`}
              className="hover:text-text-primary hover:no-underline"
            >
              @{note.author_username}
            </Link>
            {note.book && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-text-disabled" />
                <Link
                  href={`/u/${note.author_username}/books/${note.book.slug}`}
                  className="font-medium text-text-secondary hover:text-accent hover:no-underline"
                >
                  {note.book.title}
                </Link>
                <ChevronRight className="h-3.5 w-3.5 text-text-disabled" />
                <span className="text-text-primary">
                  Ch. {String(note.sequence).padStart(2, "0")}
                </span>
              </>
            )}
          </nav>

          <header className="mb-8 space-y-3 border-b border-border-subtle pb-6">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge
                variant={
                  isPrivate
                    ? "warning"
                    : note.is_published
                    ? "success"
                    : "info"
                }
                size="sm"
              >
                {isPrivate
                  ? "Private"
                  : note.is_published
                  ? "Published"
                  : "Public (Desk)"}
              </Badge>
              <span className="text-text-tertiary">Updated {updatedDate}</span>
              <NoteOwnerActions
                authorUsername={note.author_username}
                slug={note.slug}
              />
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-[2rem] sm:leading-tight">
              {note.title}
            </h1>

            {note.tags && note.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {note.tags.map((tag: string) => (
                  <Link
                    key={tag}
                    href={`/tags/${encodeURIComponent(tag)}`}
                    className="rounded-sm bg-surface-1 px-2 py-0.5 font-mono text-xs text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent hover:no-underline"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}
          </header>

          {note.moderation === "hidden" && (
            <Card
              variant="ghost"
              className="mb-6 border border-status-warning/40 p-4 text-xs"
            >
              <p className="font-semibold text-status-warning">
                This note has been hidden by a moderator and is not visible to
                others.
              </p>
              {note.moderation_note && (
                <p className="mt-1 text-text-secondary">
                  Reason: {note.moderation_note}
                </p>
              )}
            </Card>
          )}

          <NoteContent html={note.content_html} backlinks={[]} />

          {/* PREV / NEXT CHAPTER NAVIGATION */}
          {note.book && (prevChapter || nextChapter) && (
            <nav
              aria-label="Chapter Navigation"
              className="mt-12 grid grid-cols-1 gap-4 border-t border-border-subtle pt-8 sm:grid-cols-2"
            >
              {prevChapter ? (
                <Link
                  href={`/u/${note.author_username}/${prevChapter.slug}`}
                  className="group flex flex-col rounded-md border border-border-default bg-surface-0 p-4 transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-sm hover:no-underline"
                >
                  <span className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Previous &middot; Ch.{" "}
                    {String(prevChapter.sequence).padStart(2, "0")}
                  </span>
                  <span className="mt-1.5 text-sm font-semibold text-text-primary group-hover:text-accent">
                    {prevChapter.title}
                  </span>
                </Link>
              ) : (
                <div />
              )}

              {nextChapter ? (
                <Link
                  href={`/u/${note.author_username}/${nextChapter.slug}`}
                  className="group flex flex-col items-end rounded-md border border-border-default bg-surface-0 p-4 text-right transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-sm hover:no-underline"
                >
                  <span className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
                    Next &middot; Ch.{" "}
                    {String(nextChapter.sequence).padStart(2, "0")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                  <span className="mt-1.5 text-sm font-semibold text-text-primary group-hover:text-accent">
                    {nextChapter.title}
                  </span>
                </Link>
              ) : (
                <div />
              )}
            </nav>
          )}

          {note.visibility === "public" && (
            <footer className="mt-10 flex items-center justify-between border-t border-border-subtle pt-4 text-xs text-text-tertiary">
              <Link
                href={`/u/${user}/${note.slug}/path`}
                className="font-medium text-accent hover:underline"
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

        {/* RIGHT RAIL: On This Page & Backlinks (Radix ScrollArea) */}
        <aside className="lg:sticky lg:top-16">
          <NoteReaderRightRail html={note.content_html} backlinks={backlinks} />
        </aside>
      </div>
    </>
  );
}
