"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface-0 font-sans text-text-primary antialiased">
        <main className="mx-auto flex max-w-[540px] flex-col items-start px-6 py-20">
          <p className="font-mono text-xs uppercase tracking-wider text-status-danger">
            500 &middot; Unexpected Error
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Could not render the application.
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Something failed on the server. Reload the page to try again.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-6 inline-flex h-8 items-center rounded-md border border-border-default bg-text-primary px-3 text-xs font-medium text-surface-0"
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
