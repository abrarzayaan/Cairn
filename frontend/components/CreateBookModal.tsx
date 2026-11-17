"use client";

import { useState } from "react";
import { BookOpen, FolderPlus, Globe, Lock } from "lucide-react";
import {
  BookSummary,
  Category,
  createBook,
  createCategory,
} from "@/lib/api";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";

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
    defaultCategoryId || categories[0]?.id || "",
  );
  const [accessState, setAccessState] = useState<AccessState>("private");
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCategories =
    localCats.length >= categories.length ? localCats : categories;

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const cat = await createCategory({ name: newCatName.trim() });
      const next = [...activeCategories, cat].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      setLocalCats(next);
      setCategoryId(cat.id);
      setNewCatName("");
      setAddingCat(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create category",
      );
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
      const maybeNewCat = activeCategories.find(
        (c) => c.id === created.category.id,
      );
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
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Documentation Book</DialogTitle>
          <DialogDescription>
            Group sequential chapters under a desk category.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-sm border border-status-danger bg-surface-1 px-3 py-2 text-xs text-status-danger">
              {error}
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-text-secondary">
                Desk Category
              </label>
              <button
                type="button"
                onClick={() => setAddingCat((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                <FolderPlus className="h-3.5 w-3.5" />
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
                  className="flex-1 rounded-sm border border-border-default bg-surface-0 px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={handleCreateCategory}
                >
                  Add
                </Button>
              </div>
            ) : (
              <select
                value={categoryId}
                onChange={(e) =>
                  setCategoryId(e.target.value ? Number(e.target.value) : "")
                }
                className="w-full rounded-sm border border-border-default bg-surface-0 px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
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
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">
              Book Title
            </label>
            <input
              type="text"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. PostgreSQL Internals"
              className="w-full rounded-sm border border-border-default bg-surface-0 px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">
              Overview / Context (optional)
            </label>
            <textarea
              rows={2}
              maxLength={400}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What sequence of concepts this documentation book covers..."
              className="w-full rounded-sm border border-border-default bg-surface-0 px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">
              Access &amp; Publishing
            </label>
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setAccessState("private")}
                className={cn(
                  "rounded-sm border p-2.5 text-left transition-colors",
                  accessState === "private"
                    ? "border-accent bg-accent-light text-accent"
                    : "border-border-default bg-surface-0 text-text-secondary hover:border-border-strong",
                )}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <Lock className="h-3.5 w-3.5" />
                  <span>Private</span>
                </div>
                <div className="mt-1 text-[11px] opacity-80">
                  Only you on your desk
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAccessState("public_desk")}
                className={cn(
                  "rounded-sm border p-2.5 text-left transition-colors",
                  accessState === "public_desk"
                    ? "border-accent bg-accent-light text-accent"
                    : "border-border-default bg-surface-0 text-text-secondary hover:border-border-strong",
                )}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>Public Desk</span>
                </div>
                <div className="mt-1 text-[11px] opacity-80">
                  Profile &amp; link only
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAccessState("published")}
                className={cn(
                  "rounded-sm border p-2.5 text-left transition-colors",
                  accessState === "published"
                    ? "border-accent bg-accent-light text-accent"
                    : "border-border-default bg-surface-0 text-text-secondary hover:border-border-strong",
                )}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <Globe className="h-3.5 w-3.5" />
                  <span>Published</span>
                </div>
                <div className="mt-1 text-[11px] opacity-80">
                  Global search &amp; feeds
                </div>
              </button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Create Book
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
