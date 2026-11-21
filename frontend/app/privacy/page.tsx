import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Privacy & Security",
  description:
    "Plain-language privacy and security policy for Cairn: what we store, what stays private, and how to export or delete your data.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 py-6">
      <header className="space-y-2 border-b border-border-subtle pb-6">
        <p className="font-mono text-xs uppercase tracking-wider text-accent">
          Privacy &amp; Security
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          Built for developers who care about privacy.
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">
          Short, plain language. No legal traps, no ad trackers, no hidden data
          harvesting.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text-primary">
          1. What we collect (and what we never collect)
        </h2>
        <Card variant="ghost" className="p-4 text-sm leading-relaxed text-text-secondary">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-text-primary">Stored:</strong> Your numeric
              GitHub ID, public GitHub username, optional bio, and the books,
              categories, notes, and revisions you write.
            </li>
            <li>
              <strong className="text-text-primary">Never stored:</strong> Your
              GitHub OAuth access token (discarded immediately after sign-in),
              your email address, repository data, or private GitHub activity.
            </li>
            <li>
              <strong className="text-text-primary">Zero trackers:</strong> No
              Google Analytics, no advertising pixels, no third-party tracking
              scripts.
            </li>
          </ul>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text-primary">
          2. How GitHub authentication works
        </h2>
        <p className="text-sm leading-relaxed text-text-secondary">
          Cairn uses OAuth 2.1 with PKCE (S256), CSRF-protected POST initiation,
          and an empty GitHub scope (public profile only). Sessions use
          HTTP-only, SameSite cookies stored server-side — never{" "}
          <code className="rounded bg-surface-1 px-1 py-0.5 font-mono text-xs">
            localStorage
          </code>
          . You can revoke all active sessions across devices anytime from{" "}
          <Link href="/settings" className="text-accent hover:underline">
            Settings
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text-primary">
          3. Private vs Public vs Published
        </h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-text-secondary">
          <li>
            <strong className="text-text-primary">Private (default):</strong>{" "}
            Visible only to you. Non-owners always receive HTTP 404 so existence
            is never revealed. Private links inside public notes render as
            &ldquo;Private note&rdquo; without leaking titles.
          </li>
          <li>
            <strong className="text-text-primary">Public (Desk only):</strong>{" "}
            Accessible on your profile page and direct URL, excluded from global
            search, home feeds, tag pages, and sitemaps.
          </li>
          <li>
            <strong className="text-text-primary">Published:</strong>{" "}
            Discoverable in global search, home feeds, tag pages, and search
            engine sitemaps.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text-primary">
          4. Exporting &amp; deleting your data
        </h2>
        <p className="text-sm leading-relaxed text-text-secondary">
          In{" "}
          <Link href="/settings" className="text-accent hover:underline">
            Settings
          </Link>
          , you can download all of your notes (private, public, and published)
          as a ZIP archive of Markdown files with YAML front matter at any time.
          Deleting your account permanently removes your user row, books,
          personal desk shelves, notes, revisions, links, and filed reports.
          Encrypted database backups rotate out within 14 days.
        </p>
      </section>
    </div>
  );
}
