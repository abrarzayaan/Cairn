import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · Cairn",
};

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md py-12">
      <div className="rounded border border-border bg-bg-subtle p-7">
        <div className="mb-5 flex items-center gap-2 font-mono text-lg font-semibold text-text">
          <span className="inline-block h-3 w-3 rounded-[2px] bg-accent" />
          <span>cairn</span>
        </div>

        <h1 className="mb-2 font-sans text-xl font-semibold tracking-tight text-text">
          Sign in to your workspace
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-text-muted">
          Write Markdown notes, link prerequisites with{" "}
          <code className="rounded bg-bg-inset px-1 py-0.5 font-mono text-xs text-text">
            [[prereq:Title]]
          </code>
          , and generate clean Reading Paths automatically.
        </p>

        {/* Redirects to backend allauth GitHub login through Next.js rewrite */}
        <a
          href="/accounts/github/login/"
          className="inline-flex h-10 w-full items-center justify-center rounded border border-text bg-text px-4 font-mono text-xs font-medium text-bg hover:border-text-muted hover:bg-text-muted hover:no-underline"
        >
          Continue with GitHub &rarr;
        </a>

        <p className="mt-4 font-mono text-[11px] text-text-muted">
          Only reads your public GitHub profile (`read:user`). Notes default to
          private until you publish them.
        </p>
      </div>
    </div>
  );
}
