"use client";

import { useEffect, useState } from "react";
import {
  deleteMyAccount,
  exportMyNotesZip,
  fetchMe,
  updateBio,
  User,
} from "@/lib/api";

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmUsername, setConfirmUsername] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchMe().then((res) => {
      if (res.authenticated && res.user) {
        setUser(res.user);
        setBio(res.user.bio || "");
      } else {
        window.location.href = "/login";
      }
      setLoading(false);
    });
  }, []);

  const handleSaveBio = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const updated = await updateBio(bio);
      setUser(updated);
      setStatusMessage("Saved");
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not save bio."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleExportZip = async () => {
    if (!user || exporting) return;
    setExporting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const blob = await exportMyNotesZip();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cairn-${user.username}-export.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setStatusMessage("Export downloaded");
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not export notes."
      );
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || deleting || confirmUsername.trim() !== user.username) return;
    setDeleting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      await deleteMyAccount(confirmUsername.trim());
      window.location.href = "/";
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not delete account."
      );
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-text-muted">Loading...</div>
    );
  }

  if (!user) return null;

  const canConfirmDelete = confirmUsername.trim() === user.username;

  return (
    <div className="mx-auto max-w-[600px] py-4">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-text">
        Settings
      </h1>

      {statusMessage && (
        <div className="mb-4 text-sm text-ok">{statusMessage}</div>
      )}
      {errorMessage && (
        <div className="mb-4 text-sm text-danger">{errorMessage}</div>
      )}

      {/* Profile Section */}
      <section className="mb-8 border-b border-border pb-8">
        <h2 className="mb-4 text-lg font-medium text-text">Profile</h2>
        <form onSubmit={handleSaveBio} className="space-y-4">
          <div>
            <label
              htmlFor="username-input"
              className="mb-1 block text-sm text-text-muted"
            >
              GitHub username
            </label>
            <input
              id="username-input"
              type="text"
              disabled
              value={user.username}
              className="h-8 w-full rounded border border-border-strong bg-bg px-2.5 text-sm text-text opacity-70"
            />
            <p className="mt-1 text-xs text-text-muted">
              Username is synced from your GitHub account.
            </p>
          </div>

          <div>
            <label
              htmlFor="bio-input"
              className="mb-1 block text-sm text-text-muted"
            >
              Bio
            </label>
            <textarea
              id="bio-input"
              maxLength={280}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Brief description (max 280 characters)"
              className="min-h-[80px] w-full rounded border border-border-strong bg-bg p-2 text-sm text-text focus:outline-accent"
            />
            <p className="mt-1 text-xs text-text-muted">
              Plain text, maximum 280 characters. ({280 - bio.length} remaining)
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-8 items-center justify-center rounded border border-text bg-text px-4 text-sm font-medium text-bg hover:bg-text-muted hover:border-text-muted"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </form>
      </section>

      {/* Export Section */}
      <section className="mb-8 border-b border-border pb-8">
        <h2 className="mb-2 text-lg font-medium text-text">Export data</h2>
        <p className="mb-3 text-sm text-text-muted">
          Download a ZIP archive of all your notes (private, public, and
          published) as Markdown files with front matter.
        </p>
        <button
          type="button"
          onClick={handleExportZip}
          disabled={exporting}
          className="inline-flex h-8 items-center justify-center rounded border border-border-strong bg-bg px-3 text-sm font-medium text-text transition-colors hover:bg-bg-subtle disabled:opacity-50"
        >
          {exporting ? "Preparing ZIP..." : "Export ZIP"}
        </button>
      </section>

      {/* Delete Account Section */}
      <section>
        <h2 className="mb-2 text-lg font-medium text-danger">Delete account</h2>
        <p className="mb-3 text-sm text-text-muted">
          Permanently deletes your account, books, categories, notes, revisions,
          links, and reports you filed. This action cannot be undone.
        </p>

        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex h-8 items-center justify-center rounded border border-danger bg-transparent px-3 text-sm font-medium text-danger transition-colors hover:bg-danger hover:text-bg"
          >
            Delete account
          </button>
        ) : (
          <form
            onSubmit={handleDeleteAccount}
            className="mt-4 space-y-3 rounded border border-danger/50 bg-bg-subtle p-4"
          >
            <label
              htmlFor="confirm-username-input"
              className="block text-sm text-text"
            >
              Type <span className="font-mono font-semibold">{user.username}</span>{" "}
              to confirm permanent deletion:
            </label>
            <input
              id="confirm-username-input"
              type="text"
              autoComplete="off"
              value={confirmUsername}
              onChange={(e) => setConfirmUsername(e.target.value)}
              placeholder={user.username}
              className="h-8 w-full rounded border border-border-strong bg-bg px-2.5 font-mono text-sm text-text focus:outline-accent"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={!canConfirmDelete || deleting}
                className="inline-flex h-8 items-center justify-center rounded border border-danger bg-danger px-3 text-sm font-medium text-bg transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleting ? "Deleting..." : "Permanently delete account"}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setConfirmUsername("");
                }}
                className="inline-flex h-8 items-center justify-center rounded border border-border-strong bg-bg px-3 text-sm font-medium text-text hover:bg-bg-subtle"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

