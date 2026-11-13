"use client";

import { useEffect, useState } from "react";
import { fetchMe, submitReport } from "@/lib/api";

interface ReportButtonProps {
  noteId: number;
  authorUsername: string;
}

export default function ReportButton({
  noteId,
  authorUsername,
}: ReportButtonProps) {
  const [canReport, setCanReport] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<"spam" | "abuse" | "copyright" | "other">("spam");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMe().then((res) => {
      if (
        res.authenticated &&
        res.user &&
        res.user.username.toLowerCase() !== authorUsername.toLowerCase()
      ) {
        setCanReport(true);
      }
    });
  }, [authorUsername]);

  if (!canReport) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await submitReport({ note_id: noteId, reason, details });
      setSubmitted(true);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {submitted ? (
        <span className="font-mono text-xs text-text-muted">Reported</span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-mono text-xs text-text-muted hover:text-warn"
        >
          Report
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Report note"
          onClick={() => setOpen(false)}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 border border-border-strong bg-bg p-5"
          >
            <h2 className="font-mono text-sm font-semibold text-text">
              Report note
            </h2>

            {error && (
              <p className="font-mono text-xs text-warn">{error}</p>
            )}

            <div>
              <label
                htmlFor="report-reason"
                className="mb-1 block font-mono text-xs text-text-muted"
              >
                Reason
              </label>
              <select
                id="report-reason"
                value={reason}
                onChange={(e) =>
                  setReason(
                    e.target.value as "spam" | "abuse" | "copyright" | "other"
                  )
                }
                className="w-full rounded border border-border-strong bg-bg px-2.5 py-1.5 font-mono text-xs text-text"
              >
                <option value="spam">Spam</option>
                <option value="abuse">Abuse</option>
                <option value="copyright">Copyright</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="report-details"
                className="mb-1 block font-mono text-xs text-text-muted"
              >
                Details (optional, max 500 chars)
              </label>
              <textarea
                id="report-details"
                rows={3}
                maxLength={500}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full rounded border border-border-strong bg-bg px-2.5 py-1.5 text-sm text-text"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-border-strong px-3 py-1 font-mono text-xs text-text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded border border-text bg-text px-3 py-1 font-mono text-xs font-medium text-bg disabled:opacity-50"
              >
                {submitting ? "Sending..." : "Submit report"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

