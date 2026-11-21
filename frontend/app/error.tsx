"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-[540px] flex-col items-start py-16">
      <p className="font-mono text-xs uppercase tracking-wider text-status-danger">
        500 &middot; Server Error
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
        Could not load this page.
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">
        An unexpected error occurred while processing your request. Try again or
        return to the home page.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-text-primary px-3 text-xs font-medium text-surface-0 transition-colors hover:opacity-90"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-8 items-center rounded-md border border-border-default bg-surface-1 px-3 text-xs font-medium text-text-primary transition-colors hover:border-border-strong hover:no-underline"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
