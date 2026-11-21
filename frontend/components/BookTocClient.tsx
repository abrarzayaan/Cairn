"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  ChevronRight,
  Edit3,
  FilePlus2,
  Globe,
  Lock,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  BookSummary,
  Category,
  ChapterRef,
  deleteBook,
  fetchCategories,
  fetchMe,
  fetchSuggestedCategories,
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
  const [accessState, setAccessState] = useState<
    "private" | "public_desk" | "published"
  >(
    initialBook.visibility === "private"
      ? "private"
      : initialBook.is_published
      ? "published"
      : "public_desk",
  );
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchMe().then((res) => {
      if (
        res.authenticated &&
        res.user &&
        res.user.username.toLowerCase() ===
          initialBook.author_username.toLowerCase()
      ) {
        setIsOwner(true);
        Promise.all([fetchCategories(), fetchSuggestedCategories()]).then(
          ([desk, suggested]) => {
            const seen = new Set(desk.map((c) => c.id));
            const merged = [
              ...desk,
              ...suggested.filter((c) => !seen.has(c.id)),
            ];
            setCategories(merged);
          },
        );
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
        `Delete book "${book.title}"? Your chapters will remain safe as standalone notes.`,
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

    const renumbered = next.map((c, idx) => ({ ...c, sequence: idx + 1 }));
    setChapters(renumbered);
    setStatusMsg(null);
    setErrorMsg(null);

    try {
      const confirmed = await reorderBookChapters(
        book.id,
        renumbered.map((c) => c.id),
      );
      setChapters(confirmed);
      setStatusMsg("Chapter order saved.");
    } catch (err) {
      setChapters(chapters);
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to reorder chapters",
      );
    }
  };

  const firstChapter = chapters[0];
  const isPrivate = book.visibility === "private";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* BREADCRUMB */}
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1.5 text-xs text-text-tertiary"
      >
        <Link
          href={`/u/${book.author_username}`}
          className="font-medium text-text-secondary hover:text-text-primary hover:no-underline"
        >
          @{book.author_username}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-text-disabled" />
        <span>{book.category.name}</span>
        <ChevronRight className="h-3.5 w-3.5 text-text-disabled" />
        <span className="text-text-primary">{book.title}</span>
      </nav>

      {/* MODERATION BANNER */}
      {book.moderation === "hidden" && (
        <Card
          variant="ghost"
          className="border border-status-warning/40 p-4 text-xs"
        >
          <p className="font-semibold text-status-warning">
            This book has been hidden by a moderator. None of its chapters are
            visible to other users.
          </p>
          {book.moderation_note && (
            <p className="mt-1 text-text-secondary">
              Reason: {book.moderation_note}
            </p>
          )}
        </Card>
      )}

      {/* BOOK CONTEXT HEADER */}
      <Card variant="ghost" className="p-6 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info" size="md">
              {book.category.name}
            </Badge>
            <Badge
              variant={
                isPrivate ? "warning" : book.is_published ? "success" : "outline"
              }
              size="md"
            >
              {isPrivate ? (
                <>
                  <Lock className="h-3 w-3" />
                  Private
                </>
              ) : book.is_published ? (
                <>
                  <Globe className="h-3 w-3" />
                  Published
                </>
              ) : (
                <>
                  <BookOpen className="h-3 w-3" />
                  Public (Desk)
                </>
              )}
            </Badge>
            <span className="text-xs text-text-tertiary">
              {chapters.length}{" "}
              {chapters.length === 1 ? "chapter" : "chapters"}
            </span>
          </div>

          {isOwner && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <Edit3 className="h-3.5 w-3.5" />
                Edit Book
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={handleDeleteBook}
                className="text-status-danger hover:text-status-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          )}
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {book.title}
        </h1>

        {book.description && (
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">
            {book.description}
          </p>
        )}

        <div className="mt-2 text-xs text-text-tertiary">
          Written by{" "}
          <Link
            href={`/u/${book.author_username}`}
            className="font-medium text-text-secondary hover:text-accent hover:no-underline"
          >
            @{book.author_username}
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {firstChapter && (
            <Button asChild size="md" variant="primary">
              <Link
                href={`/u/${book.author_username}/${firstChapter.slug}`}
                className="hover:no-underline"
              >
                <BookOpen className="h-4 w-4" />
                <span>
                  Start Reading &middot; Ch.{" "}
                  {String(firstChapter.sequence).padStart(2, "0")}
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {isOwner && (
            <Button asChild size="md" variant="secondary">
              <Link
                href={`/new?book=${book.id}`}
                className="hover:no-underline"
              >
                <FilePlus2 className="h-4 w-4" />
                <span>Add Chapter</span>
              </Link>
            </Button>
          )}
        </div>
      </Card>

      {errorMsg && (
        <div className="rounded-md border border-status-danger/30 bg-surface-1 px-4 py-2.5 text-xs text-status-danger">
          {errorMsg}
        </div>
      )}
      {statusMsg && (
        <div className="rounded-md border border-status-success/30 bg-surface-1 px-4 py-2.5 text-xs text-status-success">
          {statusMsg}
        </div>
      )}

      {/* SEQUENTIAL TABLE OF CONTENTS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <h2 className="text-sm font-semibold text-text-primary">
            Table of Contents
          </h2>
          {isOwner && chapters.length > 1 && (
            <span className="text-xs text-text-tertiary">
              Use &uarr; / &darr; to reorder chapters
            </span>
          )}
        </div>

        {chapters.length === 0 ? (
          <Card variant="ghost" className="p-8 text-center">
            <p className="text-sm text-text-secondary">
              No chapters in this book yet.
            </p>
            {isOwner && (
              <div className="mt-4">
                <Button asChild size="md" variant="primary">
                  <Link
                    href={`/new?book=${book.id}`}
                    className="hover:no-underline"
                  >
                    <FilePlus2 className="h-4 w-4" />
                    <span>Write Chapter 01</span>
                  </Link>
                </Button>
              </div>
            )}
          </Card>
        ) : (
          <ol className="space-y-1.5">
            {chapters.map((chapter, idx) => (
              <li
                key={chapter.id}
                className="group flex flex-col justify-between gap-3 rounded-md border border-border-subtle bg-surface-0 px-4 py-3.5 transition-colors hover:border-border-default hover:bg-surface-1 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 items-start gap-3.5">
                  <span className="mt-0.5 inline-flex h-6 w-8 shrink-0 items-center justify-center rounded-sm bg-surface-2 font-mono text-xs font-medium text-text-secondary group-hover:bg-accent-light group-hover:text-accent">
                    {String(chapter.sequence).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/u/${book.author_username}/${chapter.slug}`}
                        className="text-base font-medium text-text-primary group-hover:text-accent hover:no-underline"
                      >
                        {chapter.title}
                      </Link>
                      {chapter.visibility === "private" ? (
                        <Badge variant="warning" size="sm">
                          Private
                        </Badge>
                      ) : chapter.is_published ? (
                        <Badge variant="success" size="sm">
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="outline" size="sm">
                          Desk only
                        </Badge>
                      )}
                    </div>
                    {chapter.summary && (
                      <p className="mt-1 line-clamp-2 text-sm text-text-tertiary">
                        {chapter.summary}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {isOwner && (
                    <>
                      <Tooltip content="Move chapter up">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={idx === 0}
                          onClick={() => handleMoveChapter(idx, -1)}
                          aria-label={`Move ${chapter.title} up`}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                      </Tooltip>
                      <Tooltip content="Move chapter down">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={idx === chapters.length - 1}
                          onClick={() => handleMoveChapter(idx, 1)}
                          aria-label={`Move ${chapter.title} down`}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </Tooltip>
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={`/u/${book.author_username}/${chapter.slug}/edit`}
                          className="hover:no-underline"
                        >
                          Edit
                        </Link>
                      </Button>
                    </>
                  )}
                  <Button asChild variant="secondary" size="sm">
                    <Link
                      href={`/u/${book.author_username}/${chapter.slug}`}
                      className="hover:no-underline"
                    >
                      Read &rarr;
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* EDIT BOOK DIALOG */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Book Settings</DialogTitle>
            <DialogDescription>
              Update title, category, description, or visibility for this book.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveBook} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                  Title
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-sm border border-border-default bg-surface-0 px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                  Category
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(Number(e.target.value))}
                  className="w-full rounded-sm border border-border-default bg-surface-0 px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
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
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                Description
              </label>
              <textarea
                rows={3}
                maxLength={400}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-sm border border-border-default bg-surface-0 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                Access
              </span>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { key: "private", label: "Private" },
                    { key: "public_desk", label: "Public (Desk)" },
                    { key: "published", label: "Published" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setAccessState(opt.key)}
                    className={`rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors ${
                      accessState === opt.key
                        ? "border-accent bg-accent-light text-accent"
                        : "border-border-default bg-surface-0 text-text-secondary hover:bg-surface-1"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
