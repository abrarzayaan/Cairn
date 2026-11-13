import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · Cairn",
};

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-[400px] py-16 text-center">
      <h1 className="mb-2 font-mono text-3xl font-semibold tracking-tight text-text">
        cairn
      </h1>
      <p className="mb-8 text-sm text-text-muted">
        Linked notes for developers.
      </p>

      {/* Redirects to backend allauth GitHub login through Next.js rewrite */}
      <a
        href="/accounts/github/login/"
        className="inline-flex h-10 w-full items-center justify-center rounded border border-text bg-text px-4 text-sm font-medium text-bg hover:bg-text-muted hover:border-text-muted hover:no-underline"
      >
        Sign in with GitHub
      </a>
    </div>
  );
}

