"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderPlus } from "lucide-react";
import CreateBookModal from "@/components/CreateBookModal";
import MarkdownEditor, {
  MarkdownEditorHandle,
} from "@/components/MarkdownEditor";
import NoteContent from "@/components/NoteContent";
import {
  BookSummary,
  Category,
  createCategory,
  createNote,
  deleteNote,
  fetchCategories,
  fetchMe,
  fetchMyBooks,
  fetchNoteForEdit,
  fetchNoteIdBySlug,
  fetchNoteRevisionDetail,
  fetchNoteRevisions,
  NoteRevisionDetail,
  NoteRevisionItem,
  renderMarkdownPreview,
  RenderLink,
  updateNote,
} from "@/lib/api";

interface NoteEditorProps {
  mode: "new" | "edit";
  username?: string;
  slug?: string;
}

type ViewMode = "write" | "split" | "preview";
type AccessState = "private" | "public_desk" | "published";

const TEMPLATES: Record<string, { title?: string; tags: string; body: string }> = {
  concept: {
    tags: "concept",
    body: "## Prerequisites\n\n- [[prereq:Foundational Concept]]\n\n## Core Idea\n\nExplain the concept clearly in your own words.\n\n## Example\n\n```ts\n// Minimal working example\n```\n\n## Related\n\n- [[deep:Advanced Topic]]\n",
  },
  deep: {
    tags: "internals",
    body: "## Overview\n\nBuilds on [[prereq:Core Concept]].\n\n## Internals & Edge Cases\n\n- Edge case 1\n- Edge case 2\n",
  },
  debug: {
    tags: "debugging",
    body: "## Symptom\n\nWhat broke and where?\n\n## Root Cause\n\nWhy did it happen?\n\n## Fix\n\n```\nCommand or patch that solved it\n```\n",
  },
};

function formatHHMM(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

function parseTagsInput(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean)
    .slice(0, 5);
}

export default function NoteEditor({ mode, username, slug }: NoteEditorProps) {
  const router = useRouter();
  const editorRef = useRef<MarkdownEditorHandle | null>(null);

  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<number | null>(null);
  const [ownerUsername, setOwnerUsername] = useState<string>(username || "");

  const [title, setTitle] = useState("");
  const [noteSlug, setNoteSlug] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [accessState, setAccessState] = useState<AccessState>("private");
  const [contentMd, setContentMd] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [myBooks, setMyBooks] = useState<BookSummary[]>([]);
  const [categoryFilterId, setCategoryFilterId] = useState<number | "all">("all");
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [sequence, setSequence] = useState<number>(1);
  const [bookModalOpen, setBookModalOpen] = useState(false);

  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catBusy, setCatBusy] = useState(false);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("write");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const [linksFound, setLinksFound] = useState<RenderLink[]>([]);
  const [cycleWarnings, setCycleWarnings] = useState<string[]>([]);

  const [revisions, setRevisions] = useState<NoteRevisionItem[]>([]);
  const [viewingRevision, setViewingRevision] =
    useState<NoteRevisionDetail | null>(null);

  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wordStats = useMemo(() => {
    const trimmed = contentMd.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const lines = contentMd ? contentMd.split("\n").length : 1;
    return { words, lines };
  }, [contentMd]);

  // Load auth + existing note or query templates
  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      const auth = await fetchMe();
      if (!auth.authenticated || !auth.user) {
        if (!cancelled) {
          setAuthError("Sign in required to write or edit notes.");
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setOwnerUsername(auth.user.username);
      }

      const [catsList, booksList] = await Promise.all([
        fetchCategories(),
        fetchMyBooks(),
      ]);
      if (!cancelled) {
        setCategories(catsList);
        setMyBooks(booksList);
      }

      if (mode === "new" && typeof window !== "undefined") {
        const sp = new URLSearchParams(window.location.search);
        const qTitle = sp.get("title");
        const qTpl = sp.get("template");
        const qBook = sp.get("book");
        if (qTitle && !cancelled) {
          setTitle(qTitle);
          setDirty(true);
        }
        if (qTpl && TEMPLATES[qTpl] && !cancelled) {
          const tpl = TEMPLATES[qTpl];
          setTagsInput(tpl.tags);
          setContentMd(tpl.body);
          setDirty(true);
        }
        if (qBook && !cancelled) {
          const matched = booksList.find((b) => String(b.id) === qBook);
          if (matched) {
            setSelectedBookId(matched.id);
            setCategoryFilterId(matched.category.id);
            setSequence((matched.chapter_count || 0) + 1);
            if (matched.visibility === "private") {
              setAccessState("private");
            } else if (matched.is_published) {
              setAccessState("published");
            } else {
              setAccessState("public_desk");
            }
          }
        }
      }

      if (mode === "edit" && username && slug) {
        try {
          const id = await fetchNoteIdBySlug(username, slug);
          const note = await fetchNoteForEdit(id);
          if (!cancelled) {
            setNoteId(note.id);
            setTitle(note.title);
            setNoteSlug(note.slug);
            setTagsInput(note.tags.join(" "));
            if (note.visibility === "private") {
              setAccessState("private");
            } else if (note.is_published) {
              setAccessState("published");
            } else {
              setAccessState("public_desk");
            }
            setContentMd(note.content_md);
            setSelectedBookId(note.book ? note.book.id : null);
            if (note.book) {
              setCategoryFilterId(note.book.category.id);
            }
            setSequence(note.sequence || 1);
            setLinksFound(note.links || []);
            setCycleWarnings(note.cycle_warnings || []);
            setOwnerUsername(note.author_username);
            setStatusText(`Saved ${formatHHMM(new Date(note.updated_at))}`);
            setDirty(false);

            const revs = await fetchNoteRevisions(note.id);
            if (!cancelled) setRevisions(revs);
          }
        } catch (err) {
          if (!cancelled) {
            setErrorMsg(
              err instanceof Error
                ? err.message
                : "Could not load note for editing."
            );
          }
        }
      }

      if (!cancelled) setLoading(false);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [mode, username, slug]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  // Debounced live links extraction + live split preview
  useEffect(() => {
    if (loading || authError) return;
    if (renderTimerRef.current) clearTimeout(renderTimerRef.current);

    renderTimerRef.current = setTimeout(async () => {
      try {
        const res = await renderMarkdownPreview(contentMd);
        setLinksFound(res.links);
        if (viewMode !== "write") {
          setPreviewHtml(res.html);
        }
      } catch {
        // Ignore rate-limit or transient preview errors during typing
      }
    }, 400);

    return () => {
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
    };
  }, [contentMd, loading, authError, viewMode]);

  const handleCreateCategory = async () => {
    if (!newCatName.trim() || catBusy) return;
    setCatBusy(true);
    setErrorMsg(null);
    try {
      const cat = await createCategory({ name: newCatName.trim() });
      const next = [...categories, cat].sort((a, b) => a.name.localeCompare(b.name));
      setCategories(next);
      setCategoryFilterId(cat.id);
      setNewCatName("");
      setAddingCat(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setCatBusy(false);
    }
  };

  const handleSave = useCallback(
    async (andView = false) => {
      if (saving) return;
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        setErrorMsg("Title is required.");
        return;
      }

      setSaving(true);
      setErrorMsg(null);
      const parsedTags = parseTagsInput(tagsInput);
      const visibility = accessState === "private" ? "private" : "public";
      const is_published = accessState === "published";

      try {
        let saved;
        if (noteId === null) {
          saved = await createNote({
            title: trimmedTitle,
            content_md: contentMd,
            tags: parsedTags,
            visibility,
            is_published,
            slug: noteSlug.trim() || undefined,
            book_id: selectedBookId,
            sequence: selectedBookId ? Math.max(1, sequence) : 1,
          });
          setNoteId(saved.id);
          setNoteSlug(saved.slug);
          setSequence(saved.sequence || 1);
          setLinksFound(saved.links || []);
          setCycleWarnings(saved.cycle_warnings || []);
          setDirty(false);
          setStatusText(`Saved ${formatHHMM(new Date())}`);

          if (andView) {
            router.push(`/u/${saved.author_username}/${saved.slug}`);
            return;
          }
          window.history.replaceState(
            null,
            "",
            `/u/${saved.author_username}/${saved.slug}/edit`
          );
          const revs = await fetchNoteRevisions(saved.id);
          setRevisions(revs);
        } else {
          saved = await updateNote(noteId, {
            title: trimmedTitle,
            content_md: contentMd,
            tags: parsedTags,
            visibility,
            is_published,
            slug: noteSlug.trim() || undefined,
            book_id: selectedBookId,
            sequence: selectedBookId ? Math.max(1, sequence) : 1,
          });
          setNoteSlug(saved.slug);
          setSequence(saved.sequence || 1);
          setLinksFound(saved.links || []);
          setCycleWarnings(saved.cycle_warnings || []);
          setDirty(false);
          setStatusText(`Saved ${formatHHMM(new Date())}`);

          if (andView) {
            router.push(`/u/${saved.author_username}/${saved.slug}`);
            return;
          }
          if (slug && saved.slug !== slug) {
            window.history.replaceState(
              null,
              "",
              `/u/${saved.author_username}/${saved.slug}/edit`
            );
          }
          const revs = await fetchNoteRevisions(saved.id);
          setRevisions(revs);
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to save note.");
      } finally {
        setSaving(false);
      }
    },
    [
      saving,
      title,
      tagsInput,
      noteId,
      contentMd,
      accessState,
      noteSlug,
      router,
      slug,
      selectedBookId,
      sequence,
    ]
  );

  const switchViewMode = useCallback(
    async (next: ViewMode) => {
      if (next === viewMode) return;
      if (next === "write") {
        setViewMode("write");
        return;
      }
      setPreviewLoading(true);
      setErrorMsg(null);
      try {
        const res = await renderMarkdownPreview(contentMd);
        setPreviewHtml(res.html);
        setLinksFound(res.links);
        setViewMode(next);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to render preview."
        );
      } finally {
        setPreviewLoading(false);
      }
    },
    [viewMode, contentMd]
  );

  const handleTogglePreview = useCallback(() => {
    switchViewMode(viewMode === "write" ? "split" : viewMode === "split" ? "preview" : "write");
  }, [switchViewMode, viewMode]);

  // Global document-level shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSave(true);
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        handleTogglePreview();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave, handleTogglePreview]);

  const handleBack = () => {
    if (dirty && !window.confirm("You have unsaved changes. Leave anyway?")) {
      return;
    }
    if (noteId && ownerUsername && noteSlug) {
      router.push(`/u/${ownerUsername}/${noteSlug}`);
    } else {
      router.push("/");
    }
  };

  const handleDelete = async () => {
    if (!noteId) return;
    if (
      !window.confirm("Permanently delete this note? This cannot be undone.")
    ) {
      return;
    }
    try {
      await deleteNote(noteId);
      setDirty(false);
      router.push(ownerUsername ? `/u/${ownerUsername}` : "/");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete note.");
    }
  };

  const handleOpenRevision = async (revId: number) => {
    if (!noteId) return;
    try {
      const detail = await fetchNoteRevisionDetail(noteId, revId);
      setViewingRevision(detail);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to load revision."
      );
    }
  };

  if (loading) {
    return (
      <div className="py-12 font-mono text-sm text-text-muted">
        Loading editor...
      </div>
    );
  }

  if (authError) {
    return (
      <div className="mx-auto max-w-md rounded border border-border bg-bg-subtle p-6 my-12 text-center">
        <p className="mb-4 text-sm text-warn">{authError}</p>
        <Link
          href="/login"
          className="inline-flex h-9 items-center rounded border border-text bg-text px-4 font-mono text-xs font-medium text-bg hover:no-underline"
        >
          Sign in with GitHub
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Studio Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-bg-subtle px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 font-mono text-xs text-text-muted hover:text-text"
          >
            <span>&larr;</span>
            <span className="max-w-[240px] truncate font-medium text-text">
              {title.trim() || "New note"}
            </span>
          </button>

          <span className="hidden h-4 w-px bg-border sm:inline-block" />

          <span className="flex items-center gap-1.5 font-mono text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                saving
                  ? "bg-accent animate-pulse"
                  : dirty
                  ? "bg-warn"
                  : "bg-ok"
              }`}
            />
            <span className="text-text-muted">
              {saving
                ? "Saving..."
                : dirty
                ? "Unsaved changes"
                : statusText || "Draft"}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 3-Mode Switcher */}
          <div
            className="flex rounded border border-border-strong bg-bg p-0.5 font-mono text-xs"
            role="group"
            aria-label="Editor view mode"
          >
            {(["write", "split", "preview"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchViewMode(m)}
                disabled={previewLoading && m !== "write"}
                className={`rounded px-2.5 py-1 capitalize transition-colors ${
                  viewMode === m
                    ? "bg-text text-bg font-medium"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="inline-flex h-8 items-center rounded border border-border-strong bg-bg px-3 font-mono text-xs font-medium text-text hover:bg-bg-inset disabled:opacity-50"
          >
            Save
          </button>

          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="inline-flex h-8 items-center rounded border border-text bg-text px-3 font-mono text-xs font-medium text-bg hover:border-text-muted hover:bg-text-muted disabled:opacity-50"
          >
            Save &amp; View
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded border border-warn bg-bg-subtle px-3 py-2 font-mono text-xs text-warn">
          {errorMsg}
        </div>
      )}

      {/* Main Studio Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left: Write / Split / Preview Canvas */}
        <div className="min-w-0 rounded border border-border bg-bg">
          {/* Quick Syntax Insert Bar */}
          {viewMode !== "preview" && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 font-mono text-[11px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-text-muted">Insert:</span>
                <button
                  type="button"
                  onClick={() => editorRef.current?.insertSnippet("## ", 0)}
                  className="rounded border border-border bg-bg px-2 py-0.5 text-text hover:border-accent"
                >
                  H2
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editorRef.current?.insertSnippet("```\n\n```", 4)
                  }
                  className="rounded border border-border bg-bg px-2 py-0.5 text-text hover:border-accent"
                >
                  Code
                </button>
                <button
                  type="button"
                  onClick={() => editorRef.current?.insertSnippet("[[", 0)}
                  className="rounded border border-border bg-bg px-2 py-0.5 text-text hover:border-accent"
                  title="Link a note"
                >
                  [[Link]]
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editorRef.current?.insertSnippet("[[prereq:", 0)
                  }
                  className="rounded border border-border bg-bg px-2 py-0.5 text-accent hover:border-accent"
                  title="Add prerequisite for Reading Path"
                >
                  [[prereq:]]
                </button>
                <button
                  type="button"
                  onClick={() => editorRef.current?.insertSnippet("[[deep:", 0)}
                  className="rounded border border-border bg-bg px-2 py-0.5 text-text hover:border-accent"
                  title="Add deep-dive note"
                >
                  [[deep:]]
                </button>
              </div>
              <span className="text-text-muted">
                {wordStats.words} words &middot; {wordStats.lines} lines
              </span>
            </div>
          )}

          <div
            className={
              viewMode === "split"
                ? "grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0"
                : ""
            }
          >
            {viewMode !== "preview" && (
              <div className="min-w-0 px-4">
                <MarkdownEditor
                  ref={editorRef}
                  value={contentMd}
                  onChange={(val) => {
                    setContentMd(val);
                    setDirty(true);
                  }}
                  onSave={() => handleSave(false)}
                  onSaveAndView={() => handleSave(true)}
                  onTogglePreview={handleTogglePreview}
                />
              </div>
            )}

            {viewMode !== "write" && (
              <div className="min-h-[520px] min-w-0 overflow-y-auto px-5 py-4">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  Live Preview
                </p>
                <h1 className="mb-4 font-sans text-2xl font-semibold tracking-tight text-text">
                  {title || "Untitled note"}
                </h1>
                <NoteContent html={previewHtml} backlinks={[]} />
              </div>
            )}
          </div>
        </div>

        {/* Right Inspector Sidebar */}
        <aside className="space-y-5 text-sm">
          {/* Organize Documentation First */}
          <section className="space-y-3 rounded border border-border bg-bg p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
                Organize in Book
              </h2>
              <button
                type="button"
                onClick={() => setBookModalOpen(true)}
                className="font-mono text-[11px] font-medium text-accent hover:underline"
              >
                + New Book
              </button>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label
                  htmlFor="note-category-filter"
                  className="font-mono text-xs text-text-muted"
                >
                  Topic Category
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
                    className="flex-1 rounded border border-border-strong bg-bg px-2.5 py-1 font-mono text-xs text-text focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={catBusy}
                    onClick={handleCreateCategory}
                    className="rounded border border-border-strong bg-bg-subtle px-2.5 py-1 font-mono text-xs text-text hover:border-accent"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <select
                  id="note-category-filter"
                  value={categoryFilterId}
                  onChange={(e) =>
                    setCategoryFilterId(
                      e.target.value === "all" ? "all" : Number(e.target.value)
                    )
                  }
                  className="w-full rounded border border-border-strong bg-bg px-2.5 py-1.5 text-xs text-text focus:border-accent focus:outline-none"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label
                htmlFor="note-book"
                className="mb-1 block font-mono text-xs text-text-muted"
              >
                Documentation Book
              </label>
              <select
                id="note-book"
                value={selectedBookId ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : null;
                  setSelectedBookId(val);
                  if (val !== null) {
                    const picked = myBooks.find((b) => b.id === val);
                    if (picked && noteId === null) {
                      setSequence((picked.chapter_count || 0) + 1);
                    }
                  }
                  setDirty(true);
                }}
                className="w-full rounded border border-border-strong bg-bg px-2.5 py-1.5 text-xs text-text focus:border-accent focus:outline-none"
              >
                <option value="">Standalone note (no book)</option>
                {myBooks
                  .filter(
                    (b) =>
                      categoryFilterId === "all" ||
                      b.category.id === categoryFilterId ||
                      b.id === selectedBookId
                  )
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      [{b.category.name}] {b.title} ({b.visibility})
                    </option>
                  ))}
              </select>
            </div>

            {selectedBookId !== null && (
              <div>
                <label
                  htmlFor="note-sequence"
                  className="mb-1 block font-mono text-xs text-text-muted"
                >
                  Chapter Sequence #
                </label>
                <input
                  id="note-sequence"
                  type="number"
                  min={1}
                  value={sequence}
                  onChange={(e) => {
                    setSequence(Math.max(1, Number(e.target.value) || 1));
                    setDirty(true);
                  }}
                  className="w-24 rounded border border-border-strong bg-bg px-2.5 py-1 font-mono text-xs text-text focus:border-accent focus:outline-none"
                />
                {myBooks.find((b) => b.id === selectedBookId)?.visibility ===
                  "private" && (
                  <p className="mt-1.5 font-mono text-[11px] text-warn">
                    This book is private — its chapters stay hidden until the book is public.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Metadata */}
          <section className="space-y-3 rounded border border-border bg-bg p-4">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
              Chapter Details
            </h2>

            <div>
              <label
                htmlFor="note-title"
                className="mb-1 block font-mono text-xs text-text-muted"
              >
                Title
              </label>
              <input
                id="note-title"
                type="text"
                maxLength={120}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
                placeholder="Closures"
                className="w-full rounded border border-border-strong bg-bg px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="note-slug"
                className="mb-1 block font-mono text-xs text-text-muted"
              >
                Slug
              </label>
              <input
                id="note-slug"
                type="text"
                maxLength={140}
                value={noteSlug}
                onChange={(e) => {
                  setNoteSlug(e.target.value);
                  setDirty(true);
                }}
                placeholder="auto-generated"
                className="w-full rounded border border-border-strong bg-bg px-2.5 py-1.5 font-mono text-xs text-text focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="note-tags"
                className="mb-1 block font-mono text-xs text-text-muted"
              >
                Tags (max 5, space separated)
              </label>
              <input
                id="note-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => {
                  setTagsInput(e.target.value);
                  setDirty(true);
                }}
                placeholder="javascript scope"
                className="w-full rounded border border-border-strong bg-bg px-2.5 py-1.5 font-mono text-xs text-text focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <span className="mb-1.5 block font-mono text-xs text-text-muted">
                Access &amp; Publishing
              </span>
              <div className="grid grid-cols-3 rounded border border-border-strong bg-bg-subtle p-0.5 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setAccessState("private");
                    setDirty(true);
                  }}
                  className={`rounded py-1.5 text-center transition-colors ${
                    accessState === "private"
                      ? "bg-bg text-warn font-semibold shadow-sm"
                      : "text-text-muted hover:text-text"
                  }`}
                  title="Only visible to you on your personal desk"
                >
                  Private
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccessState("public_desk");
                    setDirty(true);
                  }}
                  className={`rounded py-1.5 text-center transition-colors ${
                    accessState === "public_desk"
                      ? "bg-bg text-accent font-semibold shadow-sm"
                      : "text-text-muted hover:text-text"
                  }`}
                  title="Public on your profile desk & direct link (hidden from global search)"
                >
                  Desk Only
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccessState("published");
                    setDirty(true);
                  }}
                  className={`rounded py-1.5 text-center transition-colors ${
                    accessState === "published"
                      ? "bg-bg text-ok font-semibold shadow-sm"
                      : "text-text-muted hover:text-text"
                  }`}
                  title="Globally indexed and searchable by all developers"
                >
                  Published
                </button>
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-text-muted">
                {accessState === "private" && "Only visible to you on your personal desk."}
                {accessState === "public_desk" && "Public on your desk profile & direct link (hidden from global search)."}
                {accessState === "published" && "Globally indexed and searchable across Cairn."}
              </p>
            </div>
          </section>

          {/* Links Found + Cycle Warning */}
          <section className="rounded border border-border bg-bg p-4">
            <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
              Links found ({linksFound.length})
            </h2>
            {linksFound.length === 0 ? (
              <p className="font-mono text-xs text-text-muted">
                Type <code className="text-text">[[</code> to autocomplete your
                notes or add <code className="text-text">[[prereq:Title]]</code>.
              </p>
            ) : (
              <ul className="space-y-2 font-mono text-xs">
                {linksFound.map((link, idx) => (
                  <li
                    key={`${link.link_type}-${link.target_ref}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded bg-bg-subtle px-2 py-1.5"
                  >
                    <span className="truncate text-text">
                      <span className="text-text-muted">{link.link_type}</span>{" "}
                      {link.target_ref}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={
                          link.status === "resolved"
                            ? "text-ok"
                            : link.status === "private"
                            ? "text-warn"
                            : "text-text-muted"
                        }
                      >
                        {link.status}
                      </span>
                      {link.status === "missing" &&
                        !link.target_ref.includes("/") && (
                          <Link
                            href={`/new?title=${encodeURIComponent(
                              link.target_ref
                            )}`}
                            target="_blank"
                            className="rounded border border-border px-1 text-[10px] text-accent hover:border-accent hover:no-underline"
                            title={`Create "${link.target_ref}" in new tab`}
                          >
                            +
                          </Link>
                        )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {cycleWarnings.length > 0 && (
              <div className="mt-3 rounded border border-warn/40 bg-bg-subtle p-2.5 font-mono text-xs text-warn">
                {cycleWarnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}
          </section>

          {/* Keyboard Shortcuts */}
          <section className="rounded border border-border bg-bg p-4">
            <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
              Shortcuts
            </h2>
            <table className="w-full font-mono text-xs">
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-1 text-text">Ctrl/Cmd+S</td>
                  <td className="py-1 text-right text-text-muted">Save</td>
                </tr>
                <tr>
                  <td className="py-1 text-text">Ctrl/Cmd+Enter</td>
                  <td className="py-1 text-right text-text-muted">
                    Save &amp; view
                  </td>
                </tr>
                <tr>
                  <td className="py-1 text-text">Ctrl/Cmd+P</td>
                  <td className="py-1 text-right text-text-muted">
                    Cycle preview
                  </td>
                </tr>
                <tr>
                  <td className="py-1 text-text">[[</td>
                  <td className="py-1 text-right text-text-muted">
                    Autocomplete
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Revisions */}
          {noteId !== null && (
            <section className="rounded border border-border bg-bg p-4">
              <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
                Revisions ({revisions.length})
              </h2>
              {revisions.length === 0 ? (
                <p className="font-mono text-xs text-text-muted">
                  No revisions yet
                </p>
              ) : (
                <ul className="max-h-36 space-y-1 overflow-y-auto font-mono text-xs">
                  {revisions.map((rev) => (
                    <li key={rev.id}>
                      <button
                        type="button"
                        onClick={() => handleOpenRevision(rev.id)}
                        className="text-accent hover:underline"
                      >
                        {new Date(rev.created_at).toLocaleString()}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {noteId !== null && (
            <div className="px-1">
              <button
                type="button"
                onClick={handleDelete}
                className="font-mono text-xs text-warn hover:underline"
              >
                Delete note
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* Revision Viewer Modal */}
      {viewingRevision && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Revision preview"
        >
          <div className="w-full max-w-2xl rounded border border-border-strong bg-bg p-5">
            <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
              <span className="font-mono text-xs text-text-muted">
                Revision from{" "}
                {new Date(viewingRevision.created_at).toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setContentMd(viewingRevision.content_md);
                    setDirty(true);
                    setViewingRevision(null);
                  }}
                  className="rounded border border-border-strong px-2.5 py-1 font-mono text-xs text-text hover:bg-bg-subtle"
                >
                  Restore to editor
                </button>
                <button
                  type="button"
                  onClick={() => setViewingRevision(null)}
                  className="rounded border border-border-strong px-2.5 py-1 font-mono text-xs text-text-muted hover:text-text"
                >
                  Close
                </button>
              </div>
            </div>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-bg-subtle p-3 font-mono text-xs text-text">
              {viewingRevision.content_md}
            </pre>
          </div>
        </div>
      )}
      <CreateBookModal
        open={bookModalOpen}
        categories={categories}
        defaultCategoryId={categoryFilterId === "all" ? null : categoryFilterId}
        onClose={() => setBookModalOpen(false)}
        onCreated={(createdBook, createdCategory) => {
          if (
            createdCategory &&
            !categories.some((c) => c.id === createdCategory.id)
          ) {
            setCategories((prev) =>
              [...prev, createdCategory].sort((a, b) =>
                a.name.localeCompare(b.name)
              )
            );
          }
          setMyBooks((prev) => [createdBook, ...prev]);
          setCategoryFilterId(createdBook.category.id);
          setSelectedBookId(createdBook.id);
          if (noteId === null) {
            setSequence(1);
            if (createdBook.visibility === "private") {
              setAccessState("private");
            } else if (createdBook.is_published) {
              setAccessState("published");
            } else {
              setAccessState("public_desk");
            }
          }
          setDirty(true);
        }}
      />
    </div>
  );
}
