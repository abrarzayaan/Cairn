"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Code2,
  Columns2,
  Eye,
  FolderPlus,
  GitBranch,
  Heading2,
  HelpCircle,
  History,
  Link2,
  PanelRight,
  PenLine,
  Save,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import CreateBookModal from "@/components/CreateBookModal";
import MarkdownEditor, {
  MarkdownEditorHandle,
} from "@/components/MarkdownEditor";
import NoteContent from "@/components/NoteContent";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [showInspector, setShowInspector] = useState(false);

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
    const onShortcutHelp = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          target.closest(".cm-editor"))
      ) {
        return;
      }
      e.preventDefault();
      setShortcutsOpen((prev) => !prev);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keydown", onShortcutHelp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keydown", onShortcutHelp);
    };
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

  const selectedBook = myBooks.find((b) => b.id === selectedBookId) || null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Minimal Studio Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle bg-surface-1 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Tooltip content="Back to note">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleBack}
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Tooltip>

          <div className="flex min-w-0 items-center gap-2">
            {selectedBook && (
              <Badge variant="info" size="sm" className="hidden sm:inline-flex">
                {selectedBook.title} &middot; Ch. {String(sequence).padStart(2, "0")}
              </Badge>
            )}
            <Badge
              variant={
                accessState === "private"
                  ? "warning"
                  : accessState === "published"
                  ? "success"
                  : "outline"
              }
              size="sm"
            >
              {accessState === "private"
                ? "Private"
                : accessState === "published"
                ? "Published"
                : "Desk only"}
            </Badge>
          </div>
        </div>

        {/* Minimal Icon Toolbar with Radix Tooltips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* View Mode Toggle */}
          <div
            className="flex items-center rounded-sm border border-border-default bg-surface-0 p-0.5"
            role="group"
            aria-label="Editor view mode"
          >
            <Tooltip content="Write mode">
              <button
                type="button"
                onClick={() => switchViewMode("write")}
                aria-label="Write mode"
                className={`inline-flex h-6 w-7 items-center justify-center rounded-[4px] transition-colors ${
                  viewMode === "write"
                    ? "bg-surface-2 text-text-primary"
                    : "text-text-tertiary hover:text-text-primary"
                }`}
              >
                <PenLine className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <Tooltip content="Split view">
              <button
                type="button"
                onClick={() => switchViewMode("split")}
                disabled={previewLoading}
                aria-label="Split view"
                className={`inline-flex h-6 w-7 items-center justify-center rounded-[4px] transition-colors ${
                  viewMode === "split"
                    ? "bg-surface-2 text-text-primary"
                    : "text-text-tertiary hover:text-text-primary"
                }`}
              >
                <Columns2 className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <Tooltip content="Preview mode (Ctrl+P)">
              <button
                type="button"
                onClick={() => switchViewMode("preview")}
                disabled={previewLoading}
                aria-label="Preview mode"
                className={`inline-flex h-6 w-7 items-center justify-center rounded-[4px] transition-colors ${
                  viewMode === "preview"
                    ? "bg-surface-2 text-text-primary"
                    : "text-text-tertiary hover:text-text-primary"
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>

          <Tooltip content="Toggle links & outline panel">
            <Button
              type="button"
              variant={showInspector ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setShowInspector((v) => !v)}
              aria-label="Toggle links panel"
            >
              <PanelRight className="h-4 w-4" />
            </Button>
          </Tooltip>

          <Tooltip content="Note settings (book, slug, tags, access)">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              aria-label="Note settings"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </Tooltip>

          <Tooltip content="Keyboard shortcuts (?)">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShortcutsOpen(true)}
              aria-label="Keyboard shortcuts"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
          </Tooltip>

          <div className="mx-1 h-4 w-px bg-border-default" />

          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={saving}
            onClick={() => handleSave(false)}
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={saving}
            onClick={() => handleSave(true)}
          >
            Save &amp; View
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-status-danger/30 bg-surface-1 px-4 py-2.5 text-xs text-status-danger">
          {errorMsg}
        </div>
      )}

      {/* Main Editor Workspace */}
      <div
        className={`grid grid-cols-1 gap-6 ${
          showInspector ? "lg:grid-cols-[minmax(0,1fr)_260px]" : ""
        }`}
      >
        {/* Canvas */}
        <Card variant="flat" className="min-w-0 overflow-hidden">
          {/* Clean Borderless Title Input */}
          <div className="border-b border-border-subtle px-5 py-3.5">
            <input
              id="note-title-inline"
              type="text"
              maxLength={120}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
              placeholder="Untitled note..."
              className="w-full bg-transparent text-2xl font-semibold tracking-tight text-text-primary placeholder:text-text-disabled focus:outline-none"
            />
          </div>

          {/* Minimal Icon Formatting Bar */}
          {viewMode !== "preview" && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-1 px-3 py-1.5">
              <div className="flex items-center gap-1">
                <Tooltip content="Insert Heading 2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => editorRef.current?.insertSnippet("## ", 0)}
                    aria-label="Insert H2"
                  >
                    <Heading2 className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
                <Tooltip content="Insert Code Block">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      editorRef.current?.insertSnippet("```\n\n```", 4)
                    }
                    aria-label="Insert Code Block"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
                <Tooltip content="Insert Wikilink [[...]]">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => editorRef.current?.insertSnippet("[[", 0)}
                    aria-label="Insert Wikilink"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
                <Tooltip content="Insert Prerequisite [[prereq:...]]">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-accent hover:text-accent"
                    onClick={() =>
                      editorRef.current?.insertSnippet("[[prereq:", 0)
                    }
                    aria-label="Insert Prerequisite Link"
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
                <Tooltip content="Insert Deep Dive [[deep:...]]">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      editorRef.current?.insertSnippet("[[deep:", 0)
                    }
                    aria-label="Insert Deep Dive Link"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
              </div>
              <span className="text-xs text-text-tertiary">
                {wordStats.words} words &middot; {wordStats.lines} lines
              </span>
            </div>
          )}

          <div
            className={
              viewMode === "split"
                ? "grid grid-cols-1 divide-y divide-border-subtle md:grid-cols-2 md:divide-x md:divide-y-0"
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
              <div className="min-h-[520px] min-w-0 overflow-y-auto px-6 py-5">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Live Preview
                </p>
                <h1 className="mb-4 text-2xl font-semibold tracking-tight text-text-primary">
                  {title || "Untitled note"}
                </h1>
                <NoteContent html={previewHtml} backlinks={[]} />
              </div>
            )}
          </div>
        </Card>

        {/* Optional Collapsible Right Inspector (Links + Revisions) */}
        {showInspector && (
          <aside className="space-y-4">
            <Card variant="ghost" className="p-4">
              <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Links found ({linksFound.length})
              </h2>
              {linksFound.length === 0 ? (
                <p className="text-xs text-text-tertiary">
                  Type <code className="font-mono text-text-primary">[[</code> to
                  link notes or add{" "}
                  <code className="font-mono text-text-primary">
                    [[prereq:Title]]
                  </code>
                  .
                </p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {linksFound.map((link, idx) => (
                    <li
                      key={`${link.link_type}-${link.target_ref}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-sm bg-surface-0 px-2.5 py-1.5"
                    >
                      <span className="truncate text-text-primary">
                        <span className="font-mono text-[10px] text-text-tertiary">
                          {link.link_type}
                        </span>{" "}
                        {link.target_ref}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <Badge
                          variant={
                            link.status === "resolved"
                              ? "success"
                              : link.status === "private"
                              ? "warning"
                              : "outline"
                          }
                          size="sm"
                        >
                          {link.status}
                        </Badge>
                        {link.status === "missing" &&
                          !link.target_ref.includes("/") && (
                            <Tooltip content={`Create "${link.target_ref}"`}>
                              <Link
                                href={`/new?title=${encodeURIComponent(
                                  link.target_ref,
                                )}`}
                                target="_blank"
                                className="rounded-sm bg-accent-light px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent hover:no-underline"
                              >
                                +
                              </Link>
                            </Tooltip>
                          )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {cycleWarnings.length > 0 && (
                <div className="mt-3 rounded-sm border border-status-warning/40 bg-surface-0 p-2.5 text-xs text-status-warning">
                  {cycleWarnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              )}
            </Card>

            {noteId !== null && (
              <Card variant="ghost" className="p-4">
                <h2 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                  <History className="h-3.5 w-3.5" />
                  Revisions ({revisions.length})
                </h2>
                {revisions.length === 0 ? (
                  <p className="text-xs text-text-tertiary">No revisions yet.</p>
                ) : (
                  <ul className="max-h-44 space-y-1 overflow-y-auto text-xs">
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
              </Card>
            )}
          </aside>
        )}
      </div>

      {/* Floating Save Status Pill (Bottom Right, Motion Animation) */}
      <AnimatePresence>
        {(saving || dirty || statusText) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full border border-border-default bg-surface-0 px-3.5 py-1.5 text-xs font-medium text-text-secondary shadow-md"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                saving
                  ? "animate-pulse bg-accent"
                  : dirty
                  ? "bg-status-warning"
                  : "bg-status-success"
              }`}
            />
            <span>
              {saving
                ? "Saving..."
                : dirty
                ? "Unsaved changes"
                : statusText || "Saved"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Dialog (Radix Dialog) */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Note Settings</DialogTitle>
            <DialogDescription>
              Organize this note into a book, configure metadata, tags, and
              publishing visibility.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
            {/* Book Organization */}
            <div className="space-y-3 rounded-md bg-surface-1 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Book &amp; Category
                </span>
                <button
                  type="button"
                  onClick={() => setBookModalOpen(true)}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  + New Book
                </button>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label
                    htmlFor="note-category-filter"
                    className="text-xs text-text-secondary"
                  >
                    Category
                  </label>
                  <button
                    type="button"
                    onClick={() => setAddingCat((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <FolderPlus className="h-3 w-3" />
                    {addingCat ? "Cancel" : "+ New"}
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
                      className="flex-1 rounded-sm border border-border-default bg-surface-0 px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
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
                ) : (
                  <select
                    id="note-category-filter"
                    value={categoryFilterId}
                    onChange={(e) =>
                      setCategoryFilterId(
                        e.target.value === "all"
                          ? "all"
                          : Number(e.target.value),
                      )
                    }
                    className="w-full rounded-sm border border-border-default bg-surface-0 px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_96px]">
                <div>
                  <label
                    htmlFor="note-book"
                    className="mb-1 block text-xs text-text-secondary"
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
                    className="w-full rounded-sm border border-border-default bg-surface-0 px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
                  >
                    <option value="">Standalone note (no book)</option>
                    {myBooks
                      .filter(
                        (b) =>
                          categoryFilterId === "all" ||
                          b.category.id === categoryFilterId ||
                          b.id === selectedBookId,
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
                      className="mb-1 block text-xs text-text-secondary"
                    >
                      Chapter #
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
                      className="w-full rounded-sm border border-border-default bg-surface-0 px-2.5 py-1.5 font-mono text-xs text-text-primary focus:border-accent focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Slug & Tags */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="note-slug"
                  className="mb-1 block text-xs font-medium text-text-secondary"
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
                  className="w-full rounded-sm border border-border-default bg-surface-0 px-2.5 py-1.5 font-mono text-xs text-text-primary focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="note-tags"
                  className="mb-1 block text-xs font-medium text-text-secondary"
                >
                  Tags (max 5)
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
                  className="w-full rounded-sm border border-border-default bg-surface-0 px-2.5 py-1.5 font-mono text-xs text-text-primary focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            {/* Access & Publishing */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                Access &amp; Publishing
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    {
                      key: "private",
                      label: "Private",
                      desc: "Only visible to you on your desk.",
                    },
                    {
                      key: "public_desk",
                      label: "Desk Only",
                      desc: "Public on your profile & direct link.",
                    },
                    {
                      key: "published",
                      label: "Published",
                      desc: "Globally searchable across Cairn.",
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setAccessState(opt.key);
                      setDirty(true);
                    }}
                    className={`rounded-md border p-2.5 text-left transition-colors ${
                      accessState === opt.key
                        ? "border-accent bg-accent-light"
                        : "border-border-default bg-surface-0 hover:bg-surface-1"
                    }`}
                  >
                    <div className="text-xs font-semibold text-text-primary">
                      {opt.label}
                    </div>
                    <div className="mt-0.5 text-[11px] text-text-tertiary">
                      {opt.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {noteId !== null && (
              <div className="flex items-center justify-between border-t border-border-subtle pt-4">
                <span className="text-xs text-text-tertiary">Danger zone</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  className="text-status-danger hover:text-status-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete note
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="primary"
              onClick={() => setSettingsOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Keyboard Shortcuts Overlay (? key) */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription>
              Navigate and write without leaving the keyboard.
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border-subtle text-xs">
            {[
              { key: "Ctrl/Cmd + S", action: "Save note" },
              { key: "Ctrl/Cmd + Enter", action: "Save and view" },
              { key: "Ctrl/Cmd + P", action: "Cycle write / split / preview" },
              { key: "Ctrl/Cmd + K", action: "Open global search" },
              { key: "[[", action: "Wikilink autocomplete" },
              { key: "?", action: "Toggle this shortcuts overlay" },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between py-2"
              >
                <span className="text-text-secondary">{item.action}</span>
                <kbd className="rounded-sm border border-border-default bg-surface-1 px-1.5 py-0.5 font-mono text-[11px] text-text-primary">
                  {item.key}
                </kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Revision Viewer Dialog */}
      <Dialog
        open={Boolean(viewingRevision)}
        onOpenChange={(open) => {
          if (!open) setViewingRevision(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Revision Preview</DialogTitle>
            {viewingRevision && (
              <DialogDescription>
                Saved on {new Date(viewingRevision.created_at).toLocaleString()}
              </DialogDescription>
            )}
          </DialogHeader>
          {viewingRevision && (
            <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-md border border-border-subtle bg-surface-1 p-4 font-mono text-xs text-text-primary">
              {viewingRevision.content_md}
            </pre>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setViewingRevision(null)}
            >
              Close
            </Button>
            {viewingRevision && (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setContentMd(viewingRevision.content_md);
                  setDirty(true);
                  setViewingRevision(null);
                }}
              >
                Restore to editor
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateBookModal
        open={bookModalOpen}
        categories={categories}
        defaultCategoryId={
          categoryFilterId === "all" ? null : categoryFilterId
        }
        onClose={() => setBookModalOpen(false)}
        onCreated={(createdBook, createdCategory) => {
          if (
            createdCategory &&
            !categories.some((c) => c.id === createdCategory.id)
          ) {
            setCategories((prev) =>
              [...prev, createdCategory].sort((a, b) =>
                a.name.localeCompare(b.name),
              ),
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
