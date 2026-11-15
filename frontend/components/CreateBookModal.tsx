"use client";

import { useState } from "react";
import { X, FolderPlus, Globe, Lock, BookOpen } from "lucide-react";
import {
  BookSummary,
  Category,
  createBook,
  createCategory,
} from "@/lib/api";

interface CreateBookModalProps {
  open: boolean;
  categories: Category[];
  defaultCategoryId?: number | null;
  onClose: () => void;
  onCreated: (book: BookSummary, createdCategory?: Category) => void;
}

type AccessState = "private" | "public_desk" | "published";

export default function CreateBookModal({
  open,
  categories,
  defaultCategoryId,
  onClose,
  onCreated,
}: CreateBookModalProps) {
  const [localCats, setLocalCats] = useState<Category[]>(categories);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">(
    defaultCategoryId || categories[0]?.id || ""
  );
  const [accessState, setAccessState] = useState<AccessState>("private");
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const activeCategories = localCats.length >= categories.length ? localCats : categories;

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const cat = await createCategory({ name: newCatName.trim() });
      const next = [...activeCategories, cat].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      setLocalCats(next);
      setCategoryId(cat.id);
      setNewCatName("");
      setAddingCat(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create category");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Book title is required.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const visibility = accessState === "private" ? "private" : "public";
      const is_published = accessState === "published";
      const created = await createBook({
        title: title.trim(),
        category_id: categoryId ? Number(categoryId) : null,
        description: description.trim(),
        visibility,
        is_published,
      });
      const maybeNewCat = activeCategories.find((c) => c.id === created.category.id);
      onCreated(created, maybeNewCat);
      setTitle("");
      setDescription("");
      setAccessState("private");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create book");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-book-title"
    >
      <div className="w-full max-w-lg rounded-md border border-border-strong bg-bg p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <h2
            id="create-book-title"
            className="font-sans text-base font-semibold text-text"
          >
            New Documentation Book
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-bg-subtle hover:text-text"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded border border-danger/40 bg-bg-subtle px-3 py-2 font-mono text-xs text-danger">
              {error}
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="font-mono text-xs text-text-muted">
                Desk Category
              </label>
              <button
                type="button"
                onClick={() => setAddingCat((v) => !v)}
                className="inline-flex items-center gap-1 font-mono text-[11px] text-accent hover:underline"
              >
                <FolderPlus className="h-3 w-3" />
                {addingCat ? "Cancel" : "+ New Category"}
              </button>
            </div>

            {addingCat ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Distributed Systems"
                  maxLength={60}
                  className="flex-1 rounded border border-border-strong bg-bg px-2.5 py-1.5 font-sans text-sm text-text focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCreateCategory}
                  className="rounded border border-border-strong bg-bg-subtle px-3 py-1.5 font-mono text-xs text-text hover:border-accent"
                >
                  Add
                </button>
              </div>
            ) : (
              <select
                value={categoryId}
                onChange={(e) =>
                  setCategoryId(e.target.value ? Number(e.target.value) : "")
                }
                className="w-full rounded border border-border-strong bg-bg px-2.5 py-1.5 font-sans text-sm text-text focus:border-accent focus:outline-none"
              >
                {activeCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1 block font-mono text-xs text-text-muted">
              Book Title
            </label>
            <input
              type="text"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. PostgreSQL Internals"
              className="w-full rounded border border-border-strong bg-bg px-3 py-1.5 font-sans text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-mono text-xs text-text-muted">
              Overview / Context (optional)
            </label>
            <textarea
              rows={2}
              maxLength={400}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What sequence of concepts this documentation book covers..."
              className="w-full rounded border border-border-strong bg-bg px-3 py-1.5 font-sans text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block font-mono text-xs text-text-muted">
              Access &amp; Publishing
            </label>
            <div className="grid grid-cols-1 gap-2 font-mono text-xs sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setAccessState("private")}
                className={`rounded border p-2.5 text-left transition-colors ${
                  accessState === "private"
                    ? "border-warn bg-bg-subtle text-warn font-medium shadow-sm"
                    : "border-border bg-bg text-text-muted hover:border-border-strong"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <Lock className="h-3.5 w-3.5" />
                  <span>Private</span>
                </div>
                <div className="mt-1 text-[10px] opacity-80">Only you on your desk</div>
              </button>

              <button
                type="button"
                onClick={() => setAccessState("public_desk")}
                className={`rounded border p-2.5 text-left transition-colors ${
                  accessState === "public_desk"
                    ? "border-accent bg-bg-subtle text-accent font-medium shadow-sm"
                    : "border-border bg-bg text-text-muted hover:border-border-strong"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>Public Desk</span>
                </div>
                <div className="mt-1 text-[10px] opacity-80">Profile &amp; link only</div>
              </button>

              <button
                type="button"
                onClick={() => setAccessState("published")}
                className={`rounded border p-2.5 text-left transition-colors ${
                  accessState === "published"
                    ? "border-ok bg-bg-subtle text-ok font-medium shadow-sm"
                    : "border-border bg-bg text-text-muted hover:border-border-strong"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <Globe className="h-3.5 w-3.5" />
                  <span>Published</span>
                </div>
                <div className="mt-1 text-[10px] opacity-80">Global search &amp; feeds</div>
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-3 font-mono text-xs">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-border px-3 py-1.5 text-text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-text px-4 py-1.5 font-medium text-bg hover:bg-accent disabled:opacity-50"
            >
              {busy ? "Creating..." : "Create Book"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
