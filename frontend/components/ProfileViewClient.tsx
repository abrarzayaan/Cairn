"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FolderPlus, Plus, Trash2 } from "lucide-react";
import BookCard from "@/components/BookCard";
import CreateBookModal from "@/components/CreateBookModal";
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
    initialProfile.categories || []
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
        [...prev, cat].sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewCatName("");
      setAddingCat(false);
    } catch (err) {
      setCatError(
        err instanceof Error ? err.message : "Failed to create category"
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
        err instanceof Error ? err.message : "Failed to delete category"
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

  return (
    <div className="mx-auto max-w-[1200px] space-y-8">
      <header className="rounded-md border border-border bg-bg-subtle p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 font-mono text-xs uppercase tracking-wider text-accent">
              Developer Desk &amp; Documentation Library
            </p>
            <h1 className="font-mono text-2xl font-semibold text-text">
              @{initialProfile.username}
            </h1>
            {initialProfile.bio ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
                {initialProfile.bio}
              </p>
            ) : (
              <p className="mt-2 font-mono text-xs text-text-muted">No bio yet.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <span className="rounded border border-border bg-bg px-2.5 py-1 text-text">
              {books.length} {books.length === 1 ? "book" : "books"}
            </span>
            <span className="rounded border border-border bg-bg px-2.5 py-1 text-text">
              {initialProfile.notes.length}{" "}
              {initialProfile.notes.length === 1 ? "note" : "notes"}
            </span>
            <span className="rounded border border-border bg-bg px-2.5 py-1 text-text-muted">
              joined{" "}
              {new Date(initialProfile.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
              })}
            </span>
            {initialProfile.is_self && (
              <>
                <button
                  type="button"
                  onClick={() => setBookModalOpen(true)}
                  className="inline-flex items-center gap-1 rounded bg-text px-3 py-1 font-medium text-bg hover:bg-accent"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Book
                </button>
                <Link
                  href="/settings"
                  className="rounded border border-border-strong bg-bg px-2.5 py-1 text-text hover:border-accent hover:text-accent hover:no-underline"
                >
                  Edit profile
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-8">
          {/* BOOKS SECTION */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text">
                Documentation Books ({filteredBooks.length})
              </h2>

              {deskCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSelectedCat("all")}
                    className={`rounded border px-2 py-0.5 ${
                      selectedCat === "all"
                        ? "border-accent bg-accent text-bg"
                        : "border-border bg-bg text-text-muted hover:text-text"
                    }`}
                  >
                    All
                  </button>
                  {deskCategories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCat(cat.slug)}
                      className={`rounded border px-2 py-0.5 ${
                        selectedCat === cat.slug
                          ? "border-accent bg-accent text-bg"
                          : "border-border bg-bg text-text-muted hover:text-text"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {filteredBooks.length === 0 ? (
              <p className="rounded border border-dashed border-border p-5 font-mono text-xs text-text-muted">
                No documentation books visible in this category.
              </p>
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

          {/* NOTES / CHAPTERS SECTION */}
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text">
                Chapters &amp; Standalone Notes ({initialProfile.notes.length})
              </h2>
            </div>

            {initialProfile.notes.length === 0 ? (
              <p className="rounded border border-dashed border-border p-5 font-mono text-xs text-text-muted">
                No notes visible yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {initialProfile.notes.map((note) => (
                  <li
                    key={note.id}
                    className="rounded border border-border bg-bg p-4 transition-colors hover:border-border-strong"
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {note.book_title && note.book_slug && (
                          <Link
                            href={`/u/${initialProfile.username}/books/${note.book_slug}`}
                            className="rounded border border-border bg-bg-subtle px-2 py-0.5 font-mono text-[11px] text-accent hover:underline"
                          >
                            {note.book_title} · Ch.{" "}
                            {String(note.sequence || 1).padStart(2, "0")}
                          </Link>
                        )}
                        <Link
                          href={`/u/${initialProfile.username}/${note.slug}`}
                          className="font-sans text-base font-semibold text-text hover:text-accent hover:no-underline"
                        >
                          {note.title}
                        </Link>
                      </div>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${
                          note.visibility === "private"
                            ? "border-warn/40 bg-bg-subtle text-warn"
                            : note.is_published
                            ? "border-ok/30 bg-bg-subtle text-ok"
                            : "border-accent/30 bg-bg-subtle text-accent"
                        }`}
                      >
                        {note.visibility === "private"
                          ? "private"
                          : note.is_published
                          ? "published"
                          : "public (desk)"}
                      </span>
                    </div>

                    {note.snippet && (
                      <p className="mb-2 line-clamp-2 text-sm text-text-muted">
                        {note.snippet}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-text-muted">
                      <div className="flex flex-wrap gap-1.5">
                        {note.tags.map((t) => (
                          <Link
                            key={t}
                            href={`/tags/${encodeURIComponent(t)}`}
                            className="rounded border border-border bg-bg-subtle px-1.5 py-0.5 hover:border-accent hover:text-accent hover:no-underline"
                          >
                            #{t}
                          </Link>
                        ))}
                      </div>
                      <span>updated {formatShortDate(note.updated_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* SIDEBAR: DESK CATEGORIES & TOPICS */}
        <aside className="space-y-6">
          <section className="rounded border border-border bg-bg p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
                Desk Categories
              </h2>
              {initialProfile.is_self && (
                <button
                  type="button"
                  onClick={() => setAddingCat((v) => !v)}
                  className="inline-flex items-center gap-1 font-mono text-[11px] text-accent hover:underline"
                >
                  <FolderPlus className="h-3 w-3" />
                  {addingCat ? "Cancel" : "+ New"}
                </button>
              )}
            </div>

            {catError && (
              <div className="mb-2 rounded border border-danger/40 bg-bg-subtle p-2 font-mono text-[11px] text-danger">
                {catError}
              </div>
            )}

            {initialProfile.is_self && addingCat && (
              <div className="mb-3 flex gap-1.5">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="New category..."
                  maxLength={60}
                  className="flex-1 rounded border border-border-strong bg-bg px-2 py-1 font-mono text-xs text-text focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  disabled={catBusy}
                  onClick={handleCreateCategory}
                  className="rounded border border-border-strong bg-bg-subtle px-2 py-1 font-mono text-xs text-text hover:border-accent disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            )}

            {deskCategories.length === 0 ? (
              <p className="font-mono text-xs text-text-muted">No categories yet.</p>
            ) : (
              <ul className="space-y-1.5 font-mono text-xs">
                {deskCategories.map((cat) => (
                  <li
                    key={cat.id}
                    className="group flex items-center justify-between gap-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCat(cat.slug)}
                      className={`truncate text-left hover:text-accent ${
                        selectedCat === cat.slug
                          ? "font-semibold text-accent"
                          : "text-text"
                      }`}
                    >
                      {cat.name}
                    </button>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-text-muted">{cat.book_count}</span>
                      {initialProfile.is_self && cat.book_count === 0 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat.id)}
                          disabled={catBusy}
                          className="opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                          title="Delete empty category"
                          aria-label={`Delete ${cat.name}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded border border-border bg-bg p-4">
            <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
              Tags
            </h2>
            {initialProfile.topics.length === 0 ? (
              <p className="font-mono text-xs text-text-muted">No tags yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                {initialProfile.topics.map((t) => (
                  <Link
                    key={t.name}
                    href={`/tags/${encodeURIComponent(t.name)}`}
                    className="rounded border border-border bg-bg-subtle px-2 py-0.5 text-text-muted hover:border-accent hover:text-accent hover:no-underline"
                  >
                    #{t.name} ({t.count})
                  </Link>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      {initialProfile.is_self && (
        <CreateBookModal
          open={bookModalOpen}
          categories={allCategories}
          onClose={() => setBookModalOpen(false)}
          onCreated={(createdBook) => {
            setBooks((prev) => [createdBook, ...prev]);
            router.push(
              `/u/${createdBook.author_username}/books/${createdBook.slug}`
            );
          }}
        />
      )}
    </div>
  );
}
