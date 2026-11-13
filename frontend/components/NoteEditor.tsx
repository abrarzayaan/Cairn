"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MarkdownEditor from "@/components/MarkdownEditor";
import NoteContent from "@/components/NoteContent";
import {
  createNote,
  deleteNote,
  fetchMe,
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

  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<number | null>(null);
  const [ownerUsername, setOwnerUsername] = useState<string>(username || "");

  const [title, setTitle] = useState("");
  const [noteSlug, setNoteSlug] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [contentMd, setContentMd] = useState("");

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [previewMode, setPreviewMode] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const [linksFound, setLinksFound] = useState<RenderLink[]>([]);
  const [cycleWarnings, setCycleWarnings] = useState<string[]>([]);

  const [revisions, setRevisions] = useState<NoteRevisionItem[]>([]);
  const [viewingRevision, setViewingRevision] = useState<NoteRevisionDetail | null>(
    null
  );

  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load auth + existing note if in edit mode
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

      if (mode === "edit" && username && slug) {
        try {
          const id = await fetchNoteIdBySlug(username, slug);
          const note = await fetchNoteForEdit(id);
          if (!cancelled) {
            setNoteId(note.id);
            setTitle(note.title);
            setNoteSlug(note.slug);
            setTagsInput(note.tags.join(" "));
            setVisibility(note.visibility);
            setContentMd(note.content_md);
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
              err instanceof Error ? err.message : "Could not load note for editing."
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

  // Debounced live links extraction while typing
  useEffect(() => {
    if (loading || authError) return;
    if (renderTimerRef.current) clearTimeout(renderTimerRef.current);

    renderTimerRef.current = setTimeout(async () => {
      try {
        const res = await renderMarkdownPreview(contentMd);
        setLinksFound(res.links);
        if (previewMode) {
          setPreviewHtml(res.html);
        }
      } catch {
        // Ignore rate-limit or transient preview errors during typing
      }
    }, 500);

    return () => {
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
    };
  }, [contentMd, loading, authError, previewMode]);

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

      try {
        let saved;
        if (noteId === null) {
          saved = await createNote({
            title: trimmedTitle,
            content_md: contentMd,
            tags: parsedTags,
            visibility,
            slug: noteSlug.trim() || undefined,
          });
          setNoteId(saved.id);
          setNoteSlug(saved.slug);
          setLinksFound(saved.links || []);
          setCycleWarnings(saved.cycle_warnings || []);
          setDirty(false);
          setStatusText(`Saved ${formatHHMM(new Date())}`);

          if (andView) {
            router.push(`/u/${saved.author_username}/${saved.slug}`);
            return;
          }
          // Replace URL to edit route without full reload
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
            slug: noteSlug.trim() || undefined,
          });
          setNoteSlug(saved.slug);
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
      visibility,
      noteSlug,
      router,
      slug,
    ]
  );

  const handleTogglePreview = useCallback(async () => {
    if (previewMode) {
      setPreviewMode(false);
      return;
    }
    setPreviewLoading(true);
    setErrorMsg(null);
    try {
      const res = await renderMarkdownPreview(contentMd);
      setPreviewHtml(res.html);
      setLinksFound(res.links);
      setPreviewMode(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to render preview.");
    } finally {
      setPreviewLoading(false);
    }
  }, [previewMode, contentMd]);

  // Global document-level shortcuts (when focus is outside CodeMirror)
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
    if (!window.confirm("Permanently delete this note? This cannot be undone.")) {
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
      setErrorMsg(err instanceof Error ? err.message : "Failed to load revision.");
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
      <div className="mx-auto max-w-md py-16">
        <p className="mb-4 text-sm text-warn">{authError}</p>
        <a
          href="/login"
          className="inline-flex h-8 items-center rounded border border-text bg-text px-3 text-xs font-medium text-bg hover:no-underline"
        >
          Sign in with GitHub
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] py-4">
      {/* Top editor bar (DESIGN.md 7.4) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1.5 font-mono text-sm text-text-muted hover:text-text"
        >
          <span>&larr;</span>
          <span className="max-w-[320px] truncate font-medium text-text">
            {title.trim() || "New note"}
          </span>
        </button>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-text-muted">
            {saving
              ? "Saving..."
              : dirty
              ? "Unsaved changes"
              : statusText || ""}
          </span>

          <button
            type="button"
            onClick={handleTogglePreview}
            disabled={previewLoading}
            className={`inline-flex h-7 items-center rounded border px-2.5 font-mono text-xs ${
              previewMode
                ? "border-accent bg-accent-bg text-text"
                : "border-border-strong bg-bg text-text hover:bg-bg-subtle"
            }`}
          >
            {previewLoading ? "..." : previewMode ? "Edit" : "Preview"}
          </button>

          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="inline-flex h-7 items-center rounded border border-text bg-text px-3 text-xs font-medium text-bg hover:border-text-muted hover:bg-text-muted disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded border border-warn bg-bg-subtle px-3 py-2 font-mono text-xs text-warn">
          {errorMsg}
        </div>
      )}

      {/* Main 2-column workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_290px]">
        {/* Left: CodeMirror 6 or Preview */}
        <div className="min-w-0 border-r-0 lg:border-r lg:border-border lg:pr-6">
          {previewMode ? (
            <div className="min-h-[520px] py-2">
              <h1 className="mb-4 font-sans text-3xl font-semibold tracking-tight text-text">
                {title || "Untitled"}
              </h1>
              <NoteContent html={previewHtml} backlinks={[]} />
            </div>
          ) : (
            <MarkdownEditor
              value={contentMd}
              onChange={(val) => {
                setContentMd(val);
                setDirty(true);
              }}
              onSave={() => handleSave(false)}
              onSaveAndView={() => handleSave(true)}
              onTogglePreview={handleTogglePreview}
            />
          )}
        </div>

        {/* Right: Metadata, Links found, Shortcuts, Revisions */}
        <aside className="space-y-6 text-sm">
          {/* Metadata panel */}
          <section className="space-y-3">
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
                Visibility
              </span>
              <div className="flex items-center gap-4 font-mono text-xs">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="visibility"
                    value="private"
                    checked={visibility === "private"}
                    onChange={() => {
                      setVisibility("private");
                      setDirty(true);
                    }}
                  />
                  <span>Private</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="visibility"
                    value="public"
                    checked={visibility === "public"}
                    onChange={() => {
                      setVisibility("public");
                      setDirty(true);
                    }}
                  />
                  <span>Public</span>
                </label>
              </div>
            </div>
          </section>

          {/* Links found panel (T5.5 + T5.8) */}
          <section className="border-t border-border pt-4">
            <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
              Links found ({linksFound.length})
            </h2>
            {linksFound.length === 0 ? (
              <p className="font-mono text-xs text-text-muted">
                Use [[Title]] or [[prereq:Title]]
              </p>
            ) : (
              <ul className="space-y-1.5 font-mono text-xs">
                {linksFound.map((link, idx) => (
                  <li
                    key={`${link.link_type}-${link.target_ref}-${idx}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate text-text">
                      <span className="text-text-muted">{link.link_type}</span>{" "}
                      {link.target_ref}
                    </span>
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
                  </li>
                ))}
              </ul>
            )}

            {cycleWarnings.length > 0 && (
              <div className="mt-2 space-y-1 font-mono text-xs text-warn">
                {cycleWarnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}
          </section>

          {/* Keyboard shortcuts table (T5.9 / DESIGN.md 7.4.1) */}
          <section className="border-t border-border pt-4">
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
                    Toggle preview
                  </td>
                </tr>
                <tr>
                  <td className="py-1 text-text">[[</td>
                  <td className="py-1 text-right text-text-muted">
                    Link autocomplete
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Revisions list (T5.10) */}
          {noteId !== null && (
            <section className="border-t border-border pt-4">
              <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
                Revisions ({revisions.length})
              </h2>
              {revisions.length === 0 ? (
                <p className="font-mono text-xs text-text-muted">
                  No revisions yet
                </p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto font-mono text-xs">
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

          {/* Delete button for existing note */}
          {noteId !== null && (
            <section className="border-t border-border pt-4">
              <button
                type="button"
                onClick={handleDelete}
                className="font-mono text-xs text-warn hover:underline"
              >
                Delete note
              </button>
            </section>
          )}
        </aside>
      </div>

      {/* Revision viewer modal */}
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
    </div>
  );
}
