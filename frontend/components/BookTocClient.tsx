"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Edit3,
  FilePlus2,
  Globe,
  Lock,
  Trash2,
} from "lucide-react";
import {
  BookSummary,
  Category,
  ChapterRef,
  deleteBook,
  fetchCategories,
  fetchMe,
  reorderBookChapters,
  updateBook,
} from "@/lib/api";

interface BookTocClientProps {
  initialBook: BookSummary;
  initialChapters: ChapterRef[];
}

export default function BookTocClient({
  initialBook,
  initialChapters,
}: BookTocClientProps) {
  const router = useRouter();
  const [book, setBook] = useState<BookSummary>(initialBook);
  const [chapters, setChapters] = useState<ChapterRef[]>(initialChapters);
  const [isOwner, setIsOwner] = useState(false);
  const [editing, setEditing] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  const [title, setTitle] = useState(initialBook.title);
  const [description, setDescription] = useState(initialBook.description);
  const [categoryId, setCategoryId] = useState(initialBook.category.id);
  const [accessState, setAccessState] = useState<"private" | "public_desk" | "published">(
    initialBook.visibility === "private"
      ? "private"
      : initialBook.is_published
      ? "published"
      : "public_desk"
  );
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchMe().then((res) => {
      if (
        res.authenticated &&
        res.user &&
        res.user.username.toLowerCase() === initialBook.author_username.toLowerCase()
      ) {
        setIsOwner(true);
        fetchCategories().then(setCategories);
      }
    });
  }, [initialBook.author_username]);

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const visibility = accessState === "private" ? "private" : "public";
      const is_published = accessState === "published";
      const updated = await updateBook(book.id, {
        title: title.trim(),
        description: description.trim(),
        category_id: categoryId,
        visibility,
        is_published,
      });
      setBook(updated);
      setEditing(false);
      setStatusMsg("Book updated.");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update book");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBook = async () => {
    if (
      !window.confirm(
        `Delete book "${book.title}"? Your chapters will remain safe as standalone notes.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteBook(book.id);
      router.push(`/u/${book.author_username}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete book");
      setBusy(false);
    }
  };

  const handleMoveChapter = async (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= chapters.length) return;
    const next = [...chapters];
    const [moved] = next.splice(index, 1);
    next.splice(targetIdx, 0, moved);

    // Optimistically re-number 1..N
    const renumbered = next.map((c, idx) => ({ ...c, sequence: idx + 1 }));
    setChapters(renumbered);
    setStatusMsg(null);
    setErrorMsg(null);

    try {
      const confirmed = await reorderBookChapters(
        book.id,
        renumbered.map((c) => c.id)
      );
      setChapters(confirmed);
      setStatusMsg("Sequence saved.");
    } catch (err) {
      setChapters(chapters);
      setErrorMsg(err instanceof Error ? err.message : "Failed to reorder chapters");
    }
  };

  const firstChapter = chapters[0];
  const isPrivate = book.visibility === "private";

  return (
    <div className="mx-auto max-w-[960px] space-y-6">
      {/* BREADCRUMB */}
      <nav className="flex flex-wrap items-center gap-2 font-mono text-xs text-text-muted">
        <Link href="/" className="hover:text-text">
          Docs
        </Link>
        <span>/</span>
        <Link
          href={`/search?type=books&category=${encodeURIComponent(book.category.slug)}`}
          className="hover:text-text"
        >
          {book.category.name}
        </Link>
        <span>/</span>
        <Link href={`/u/${book.author_username}`} className="hover:text-text">
          @{book.author_username}
        </Link>
        <span>/</span>
        <span className="text-text">{book.title}</span>
      </nav>

      {/* MODERATION BANNER */}
      {book.moderation === "hidden" && (
        <div className="rounded border border-warn bg-bg-subtle p-4 font-mono text-xs text-warn">
          <p className="font-semibold">
            This book has been hidden by a moderator. None of its chapters are visible to other users.
          </p>
          {book.moderation_note && (
            <p className="mt-1 text-text-muted">Reason: {book.moderation_note}</p>
          )}
        </div>
      )}

      {/* BOOK CONTEXT HEADER */}
      <header className="rounded-md border border-border bg-bg-subtle p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="rounded border border-border bg-bg px-2 py-0.5 font-medium text-accent">
              {book.category.name}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${
                isPrivate
                  ? "border-warn/40 bg-bg text-warn"
                  : book.is_published
                  ? "border-ok/30 bg-bg text-ok"
                  : "border-accent/30 bg-bg text-accent"
              }`}
            >
              {isPrivate ? (
                <>
                  <Lock className="h-3 w-3" />
                  <span>Private</span>
                </>
              ) : book.is_published ? (
                <>
                  <Globe className="h-3 w-3" />
                  <span>Published</span>
                </>
              ) : (
                <>
                  <BookOpen className="h-3 w-3" />
                  <span>Public (Desk)</span>
                </>
              )}
            </span>
            <span className="text-text-muted">
              {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}
            </span>
          </div>

          {isOwner && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="inline-flex items-center gap-1 rounded border border-border-strong bg-bg px-2.5 py-1 text-text hover:border-accent hover:text-accent"
              >
                <Edit3 className="h-3 w-3" />
                <span>{editing ? "Close Edit" : "Edit Book"}</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleDeleteBook}
                className="inline-flex items-center gap-1 rounded border border-border bg-bg px-2.5 py-1 text-danger hover:border-danger"
              >
                <Trash2 className="h-3 w-3" />
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>

        <h1 className="font-sans text-3xl font-semibold tracking-tight text-text">
          {book.title}
        </h1>

        {book.description && (
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-text-muted">
            {book.description}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 font-mono text-xs">
          {firstChapter && (
            <Link
              href={`/u/${book.author_username}/${firstChapter.slug}`}
              className="inline-flex h-9 items-center gap-2 rounded bg-text px-4 font-medium text-bg hover:bg-accent hover:no-underline"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Start Reading: Ch. {String(firstChapter.sequence).padStart(2, "0")}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
          {isOwner && (
            <Link
              href={`/new?book=${book.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded border border-border-strong bg-bg px-3.5 font-medium text-text hover:border-accent hover:text-accent hover:no-underline"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              <span>+ Add Chapter</span>
            </Link>
          )}
        </div>
      </header>

      {/* OWNER INLINE EDIT PANEL */}
      {isOwner && editing && (
        <form
          onSubmit={handleSaveBook}
          className="space-y-4 rounded-md border border-border-strong bg-bg p-5"
        >
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
            Edit Book Settings
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-mono text-xs text-text-muted">Title</label>
              <input
                type="text"
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded border border-border-strong bg-bg px-3 py-1.5 text-sm text-text"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-xs text-text-muted">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="w-full rounded border border-border-strong bg-bg px-3 py-1.5 text-sm text-text"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block font-mono text-xs text-text-muted">Description</label>
            <textarea
              rows={2}
              maxLength={400}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border border-border-strong bg-bg px-3 py-1.5 text-sm text-text"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-mono text-xs">
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={`rounded border px-3 py-1 ${
                  visibility === "private"
                    ? "border-warn bg-bg-subtle text-warn"
                    : "border-border text-text-muted"
                }`}
              >
                Private Book
              </button>
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className={`rounded border px-3 py-1 ${
                  visibility === "public"
                    ? "border-ok bg-bg-subtle text-ok"
                    : "border-border text-text-muted"
                }`}
              >
                Public Book
              </button>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="rounded bg-text px-4 py-1.5 font-mono text-xs font-medium text-bg hover:bg-accent"
            >
              {busy ? "Saving..." : "Save Book"}
            </button>
          </div>
        </form>
      )}

      {errorMsg && (
        <div className="rounded border border-danger/40 bg-bg-subtle px-3 py-2 font-mono text-xs text-danger">
          {errorMsg}
        </div>
      )}
      {statusMsg && (
        <div className="rounded border border-ok/40 bg-bg-subtle px-3 py-2 font-mono text-xs text-ok">
          {statusMsg}
        </div>
      )}

      {/* SEQUENTIAL TABLE OF CONTENTS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text">
            Table of Contents (Reading Sequence)
          </h2>
          {isOwner && chapters.length > 1 && (
            <span className="font-mono text-[11px] text-text-muted">
              Use &uarr; / &darr; to reorder chapters
            </span>
          )}
        </div>

        {chapters.length === 0 ? (
          <div className="rounded-md border border-dashed border-border-strong bg-bg-subtle p-6 text-center">
            <p className="font-sans text-sm text-text-muted">
              No chapters in this book yet.
            </p>
            {isOwner && (
              <Link
                href={`/new?book=${book.id}`}
                className="mt-3 inline-flex items-center gap-1.5 rounded bg-text px-4 py-2 font-mono text-xs text-bg hover:bg-accent hover:no-underline"
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                <span>Write Chapter 01</span>
              </Link>
            )}
          </div>
        ) : (
          <ol className="divide-y divide-border rounded-md border border-border bg-bg">
            {chapters.map((chapter, idx) => (
              <li
                key={chapter.id}
                className="flex flex-col justify-between gap-3 p-4 transition-colors hover:bg-bg-subtle/60 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 items-start gap-3.5">
                  <span className="mt-0.5 inline-flex h-7 w-8 shrink-0 items-center justify-center rounded border border-border bg-bg-subtle font-mono text-xs font-semibold text-accent">
                    {String(chapter.sequence).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/u/${book.author_username}/${chapter.slug}`}
                        className="font-sans text-base font-semibold text-text hover:text-accent hover:no-underline"
                      >
                        {chapter.title}
                      </Link>
                      {chapter.visibility === "private" && (
                        <span className="rounded border border-warn/40 bg-bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-warn">
                          private
                        </span>
                      )}
                    </div>
                    {chapter.summary && (
                      <p className="mt-1 line-clamp-2 text-sm text-text-muted">
                        {chapter.summary}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 font-mono text-xs">
                  {isOwner && (
                    <>
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveChapter(idx, -1)}
                        className="rounded border border-border bg-bg px-2 py-1 text-text-muted hover:border-border-strong hover:text-text disabled:opacity-30"
                        title="Move chapter up"
                        aria-label={`Move ${chapter.title} up`}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === chapters.length - 1}
                        onClick={() => handleMoveChapter(idx, 1)}
                        className="rounded border border-border bg-bg px-2 py-1 text-text-muted hover:border-border-strong hover:text-text disabled:opacity-30"
                        title="Move chapter down"
                        aria-label={`Move ${chapter.title} down`}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <Link
                        href={`/u/${book.author_username}/${chapter.slug}/edit`}
                        className="rounded border border-border bg-bg px-2.5 py-1 text-text-muted hover:border-accent hover:text-accent hover:no-underline"
                      >
                        Edit
                      </Link>
                    </>
                  )}
                  <Link
                    href={`/u/${book.author_username}/${chapter.slug}`}
                    className="rounded border border-border-strong bg-bg-subtle px-2.5 py-1 text-text hover:border-accent hover:text-accent hover:no-underline"
                  >
                    Read &rarr;
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

