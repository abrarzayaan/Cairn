"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as Avatar from "@radix-ui/react-avatar";
import {
  ExternalLink,
  Folder,
  FolderPlus,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import BookCard from "@/components/BookCard";
import CreateBookModal from "@/components/CreateBookModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  BookSummary,
  Category,
  createCategory,
  deleteCategory,
  fetchCategories,
  UserProfile,
} from "@/lib/api";

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function ProfileViewClient({
  initialProfile,
}: {
  initialProfile: UserProfile;
}) {
  const router = useRouter();
  const [books, setBooks] = useState<BookSummary[]>(initialProfile.books || []);
  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [allCategories, setAllCategories] = useState<Category[]>(
    initialProfile.categories || [],
  );
  const [bookModalOpen, setBookModalOpen] = useState(false);

  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catBusy, setCatBusy] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProfile.is_self) {
      fetchCategories().then((cats) => {
        if (cats.length > 0) setAllCategories(cats);
      });
    }
  }, [initialProfile.is_self]);

  const handleCreateCategory = async () => {
    if (!newCatName.trim() || catBusy) return;
    setCatBusy(true);
    setCatError(null);
    try {
      const cat = await createCategory({ name: newCatName.trim() });
      setAllCategories((prev) =>
        [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewCatName("");
      setAddingCat(false);
    } catch (err) {
      setCatError(
        err instanceof Error ? err.message : "Failed to create category",
      );
    } finally {
      setCatBusy(false);
    }
  };

  const handleDeleteCategory = async (catId: number) => {
    if (catBusy) return;
    setCatBusy(true);
    setCatError(null);
    try {
      await deleteCategory(catId);
      setAllCategories((prev) => prev.filter((c) => c.id !== catId));
      if (selectedCat === allCategories.find((c) => c.id === catId)?.slug) {
        setSelectedCat("all");
      }
    } catch (err) {
      setCatError(
        err instanceof Error ? err.message : "Failed to delete category",
      );
    } finally {
      setCatBusy(false);
    }
  };

  const deskCategories = initialProfile.is_self
    ? allCategories
    : initialProfile.categories || [];

  const filteredBooks =
    selectedCat === "all"
      ? books
      : books.filter((b) => b.category.slug === selectedCat);

  const initials = initialProfile.username.slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* PROFILE HEADER */}
      <Card variant="ghost" className="p-6">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="flex items-start gap-4">
            <Avatar.Root className="inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-light text-lg font-semibold text-accent">
              <Avatar.Fallback delayMs={0}>{initials}</Avatar.Fallback>
            </Avatar.Root>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-semibold tracking-tight text-text-primary">
                  @{initialProfile.username}
                </h1>
                <a
                  href={`https://github.com/${encodeURIComponent(initialProfile.username)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-sm border border-border-default bg-surface-0 px-2 py-0.5 text-xs text-text-secondary transition-colors hover:border-border-strong hover:text-accent hover:no-underline"
                >
                  github.com/{initialProfile.username}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {initialProfile.bio ? (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
                  {initialProfile.bio}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-text-tertiary">No bio yet.</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                <span>
                  <strong className="font-medium text-text-primary">
                    {books.length}
                  </strong>{" "}
                  {books.length === 1 ? "book" : "books"}
                </span>
                <span>&middot;</span>
                <span>
                  <strong className="font-medium text-text-primary">
                    {initialProfile.notes.length}
                  </strong>{" "}
                  {initialProfile.notes.length === 1 ? "note" : "notes"}
                </span>
                <span>&middot;</span>
                <span>
                  Joined{" "}
                  {new Date(initialProfile.created_at).toLocaleDateString(
                    undefined,
                    { year: "numeric", month: "short" },
                  )}
                </span>
              </div>
            </div>
          </div>

          {initialProfile.is_self && (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => setBookModalOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                New Book
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link href="/settings" className="hover:no-underline">
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </Link>
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* TWO-COLUMN DESK: LEFT CATEGORY FILTER | RIGHT BOOKS + NOTES */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        {/* LEFT FILTER SIDEBAR */}
        <aside className="space-y-6 lg:sticky lg:top-16">
          <section className="space-y-2">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Desk Categories
              </h2>
              {initialProfile.is_self && (
                <button
                  type="button"
                  onClick={() => setAddingCat((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  {addingCat ? "Cancel" : "New"}
                </button>
              )}
            </div>

            {catError && (
              <p className="rounded-sm bg-surface-1 px-2.5 py-1.5 text-xs text-status-danger">
                {catError}
              </p>
            )}

            {initialProfile.is_self && addingCat && (
              <div className="flex gap-1.5 px-1 pb-1">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Category name..."
                  maxLength={60}
                  className="min-w-0 flex-1 rounded-sm border border-border-default bg-surface-0 px-2.5 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={catBusy}
                  onClick={handleCreateCategory}
                >
                  Add
                </Button>
              </div>
            )}

            <ul className="space-y-0.5">
              <li>
                <button
                  type="button"
                  onClick={() => setSelectedCat("all")}
                  className="relative flex w-full items-center justify-between rounded-sm px-2.5 py-1.5 text-left text-sm transition-colors"
                >
                  {selectedCat === "all" && (
                    <motion.span
                      layoutId="profile-cat-active"
                      transition={{ duration: 0.16, ease: "easeOut" }}
                      className="absolute inset-0 rounded-sm bg-surface-2"
                    />
                  )}
                  <span
                    className={`relative z-10 flex items-center gap-2 ${
                      selectedCat === "all"
                        ? "font-medium text-text-primary"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <Folder className="h-3.5 w-3.5 text-accent" />
                    All books
                  </span>
                  <span className="relative z-10 text-xs text-text-tertiary">
                    {books.length}
                  </span>
                </button>
              </li>

              {deskCategories.map((cat) => {
                const isActive = selectedCat === cat.slug;
                return (
                  <li
                    key={cat.id}
                    className="group relative flex items-center justify-between"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCat(cat.slug)}
                      className="relative flex min-w-0 flex-1 items-center justify-between rounded-sm px-2.5 py-1.5 text-left text-sm transition-colors"
                    >
                      {isActive && (
                        <motion.span
                          layoutId="profile-cat-active"
                          transition={{ duration: 0.16, ease: "easeOut" }}
                          className="absolute inset-0 rounded-sm bg-surface-2"
                        />
                      )}
                      <span
                        className={`relative z-10 flex min-w-0 items-center gap-2 truncate ${
                          isActive
                            ? "font-medium text-text-primary"
                            : "text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        <Folder className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                        <span className="truncate">{cat.name}</span>
                      </span>
                      <span className="relative z-10 ml-2 shrink-0 text-xs text-text-tertiary">
                        {cat.book_count}
                      </span>
                    </button>
                    {initialProfile.is_self && cat.book_count === 0 && (
                      <Tooltip content="Delete empty category" side="right">
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat.id)}
                          disabled={catBusy}
                          className="ml-1 rounded-sm p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-surface-2 hover:text-status-danger group-hover:opacity-100"
                          aria-label={`Delete ${cat.name}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </Tooltip>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {initialProfile.topics.length > 0 && (
            <section className="space-y-2.5 border-t border-border-subtle pt-5">
              <h2 className="px-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Tags
              </h2>
              <div className="flex flex-wrap gap-1.5 px-2">
                {initialProfile.topics.map((t) => (
                  <Link
                    key={t.name}
                    href={`/tags/${encodeURIComponent(t.name)}`}
                    className="rounded-sm bg-surface-1 px-2 py-0.5 font-mono text-xs text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent hover:no-underline"
                  >
                    #{t.name}{" "}
                    <span className="text-text-tertiary">{t.count}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>

        {/* RIGHT MAIN: BOOKS GRID & NOTES */}
        <div className="min-w-0 space-y-10">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-text-primary">
                Documentation Books{" "}
                <span className="text-sm font-normal text-text-tertiary">
                  ({filteredBooks.length})
                </span>
              </h2>
            </div>

            {filteredBooks.length === 0 ? (
              <Card variant="ghost" className="p-8 text-center">
                <p className="text-sm text-text-secondary">
                  No documentation books visible in this category.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {filteredBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    showAuthor={false}
                    isOwner={initialProfile.is_self}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-base font-semibold text-text-primary">
              Chapters &amp; Standalone Notes{" "}
              <span className="text-sm font-normal text-text-tertiary">
                ({initialProfile.notes.length})
              </span>
            </h2>

            {initialProfile.notes.length === 0 ? (
              <Card variant="ghost" className="p-8 text-center">
                <p className="text-sm text-text-secondary">
                  No notes visible yet.
                </p>
              </Card>
            ) : (
              <ul className="space-y-2.5">
                {initialProfile.notes.map((note) => (
                  <li key={note.id}>
                    <Card variant="interactive" className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/u/${initialProfile.username}/${note.slug}`}
                            className="text-base font-semibold text-text-primary hover:text-accent hover:no-underline"
                          >
                            {note.title}
                          </Link>
                          {note.book_title && note.book_slug && (
                            <Link
                              href={`/u/${initialProfile.username}/books/${note.book_slug}`}
                              className="rounded-sm bg-accent-light px-2 py-0.5 text-xs font-medium text-accent hover:no-underline"
                            >
                              {note.book_title} &middot; Ch.{" "}
                              {String(note.sequence || 1).padStart(2, "0")}
                            </Link>
                          )}
                        </div>
                        <Badge
                          variant={
                            note.visibility === "private"
                              ? "warning"
                              : note.is_published
                              ? "success"
                              : "outline"
                          }
                          size="sm"
                        >
                          {note.visibility === "private"
                            ? "Private"
                            : note.is_published
                            ? "Published"
                            : "Desk only"}
                        </Badge>
                      </div>

                      {note.snippet && (
                        <p className="mt-1.5 line-clamp-2 text-sm text-text-secondary">
                          {note.snippet}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-tertiary">
                        <div className="flex flex-wrap gap-1.5">
                          {note.tags.map((t) => (
                            <Link
                              key={t}
                              href={`/tags/${encodeURIComponent(t)}`}
                              className="rounded-sm bg-surface-1 px-1.5 py-0.5 font-mono text-[11px] text-text-secondary hover:text-accent hover:no-underline"
                            >
                              #{t}
                            </Link>
                          ))}
                        </div>
                        <span>Updated {formatShortDate(note.updated_at)}</span>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {initialProfile.is_self && (
        <CreateBookModal
          open={bookModalOpen}
          categories={allCategories}
          onClose={() => setBookModalOpen(false)}
          onCreated={(created) => {
            setBooks((prev) => [created, ...prev]);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
