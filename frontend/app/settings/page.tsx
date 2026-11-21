"use client";

import { useEffect, useState } from "react";
import { Download, LogOut, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  deleteMyAccount,
  exportMyNotesZip,
  fetchMe,
  logoutAllDevices,
  updateBio,
  User,
} from "@/lib/api";

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);
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
      setStatusMessage("Profile changes saved.");
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not save bio.",
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
      setStatusMessage("Export downloaded.");
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not export notes.",
      );
    } finally {
      setExporting(false);
    }
  };

  const handleLogoutAll = async () => {
    if (revokingSessions) return;
    setRevokingSessions(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await logoutAllDevices();
      window.location.href = "/login";
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Could not sign out all sessions.",
      );
      setRevokingSessions(false);
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
        err instanceof Error ? err.message : "Could not delete account.",
      );
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-text-tertiary">
        Loading...
      </div>
    );
  }

  if (!user) return null;

  const canConfirmDelete = confirmUsername.trim() === user.username;

  return (
    <div className="mx-auto max-w-xl space-y-8 py-4">
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
        Settings
      </h1>

      {statusMessage && (
        <div className="rounded-md border border-status-success/30 bg-surface-1 px-4 py-2.5 text-xs text-status-success">
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div className="rounded-md border border-status-danger/30 bg-surface-1 px-4 py-2.5 text-xs text-status-danger">
          {errorMessage}
        </div>
      )}

      {/* Profile Section */}
      <section className="border-b border-border-subtle pb-8">
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          Profile
        </h2>
        <form onSubmit={handleSaveBio} className="space-y-4">
          <div>
            <label
              htmlFor="username-input"
              className="mb-1.5 block text-xs font-medium text-text-secondary"
            >
              GitHub username
            </label>
            <input
              id="username-input"
              type="text"
              disabled
              value={user.username}
              className="h-9 w-full rounded-sm border border-border-default bg-surface-1 px-3 font-mono text-sm text-text-secondary opacity-80"
            />
            <p className="mt-1 text-xs text-text-tertiary">
              Synced from your GitHub account on sign-in.
            </p>
          </div>

          <div>
            <label
              htmlFor="bio-input"
              className="mb-1.5 block text-xs font-medium text-text-secondary"
            >
              Bio
            </label>
            <textarea
              id="bio-input"
              maxLength={280}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Brief description (max 280 characters)"
              className="min-h-[84px] w-full rounded-sm border border-border-default bg-surface-0 p-2.5 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-xs text-text-tertiary">
              Plain text, maximum 280 characters. ({280 - bio.length} remaining)
            </p>
          </div>

          <Button type="submit" variant="primary" size="md" loading={saving}>
            Save changes
          </Button>
        </form>
      </section>

      {/* Sessions & Security Section */}
      <section className="border-b border-border-subtle pb-8">
        <h2 className="mb-2 text-base font-semibold text-text-primary">
          Sessions &amp; Security
        </h2>
        <p className="mb-4 text-sm text-text-secondary">
          Cairn never stores your GitHub OAuth token. If you signed in on a
          shared device, revoke all active Cairn sessions everywhere.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="md"
          loading={revokingSessions}
          onClick={handleLogoutAll}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out of all devices
        </Button>
      </section>

      {/* Export Section */}
      <section className="border-b border-border-subtle pb-8">
        <h2 className="mb-2 text-base font-semibold text-text-primary">
          Export data
        </h2>
        <p className="mb-4 text-sm text-text-secondary">
          Download a ZIP archive of all your notes (private, public, and
          published) as Markdown files with YAML front matter.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="md"
          loading={exporting}
          onClick={handleExportZip}
        >
          <Download className="h-3.5 w-3.5" />
          Export ZIP
        </Button>
      </section>

      {/* Delete Account Section */}
      <section>
        <h2 className="mb-2 text-base font-semibold text-status-danger">
          Delete account
        </h2>
        <p className="mb-4 text-sm text-text-secondary">
          Permanently deletes your account, books, desk shelves, notes,
          revisions, links, and reports you filed. This action cannot be undone.
        </p>

        {!showDeleteConfirm ? (
          <Button
            type="button"
            variant="danger"
            size="md"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete account
          </Button>
        ) : (
          <Card
            variant="ghost"
            className="mt-4 border border-status-danger/40 p-4"
          >
            <form onSubmit={handleDeleteAccount} className="space-y-3">
              <label
                htmlFor="confirm-username-input"
                className="block text-sm text-text-primary"
              >
                Type{" "}
                <span className="font-mono font-semibold">{user.username}</span>{" "}
                to confirm permanent deletion:
              </label>
              <input
                id="confirm-username-input"
                type="text"
                autoComplete="off"
                value={confirmUsername}
                onChange={(e) => setConfirmUsername(e.target.value)}
                placeholder={user.username}
                className="h-9 w-full rounded-sm border border-border-default bg-surface-0 px-3 font-mono text-sm text-text-primary focus:border-accent focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  variant="danger"
                  size="md"
                  loading={deleting}
                  disabled={!canConfirmDelete}
                >
                  Permanently delete account
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={deleting}
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setConfirmUsername("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )}
      </section>
    </div>
  );
}
