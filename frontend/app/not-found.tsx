import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-[540px] flex-col items-start py-16">
      <p className="font-mono text-xs uppercase tracking-wider text-text-tertiary">
        404 &middot; Not Found
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
        This page does not exist.
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">
        The note, book, or profile you requested could not be found, or it is
        private.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href="/"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-text-primary px-3 text-xs font-medium text-surface-0 transition-colors hover:opacity-90 hover:no-underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>
        <Link
          href="/search"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-surface-1 px-3 text-xs font-medium text-text-primary transition-colors hover:border-border-strong hover:no-underline"
        >
          <Search className="h-3.5 w-3.5" />
          Search docs
        </Link>
      </div>
    </div>
  );
}
