import type { Metadata } from "next";
import Link from "next/link";
import { Download, KeyRound, Lock, ShieldCheck } from "lucide-react";
import GitHubLoginButton from "@/components/GitHubLoginButton";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Cairn with GitHub using zero-scope public profile authentication.",
};

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md py-10 sm:py-16">
      <Card variant="flat" className="p-6 sm:p-8">
        <div className="mb-5 flex items-center gap-2 text-sm font-semibold tracking-tight text-text-primary">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-accent" />
          <span>cairn</span>
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-text-primary">
          Sign in to your developer desk
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          Write Markdown docs, link prerequisites with{" "}
          <code className="rounded bg-surface-1 px-1.5 py-0.5 font-mono text-xs text-text-primary">
            [[prereq:Title]]
          </code>
          , and generate automatic Reading Paths.
        </p>

        <div className="mt-6">
          <GitHubLoginButton />
        </div>

        {/* Transparent Security & Permission Guarantee */}
        <div className="mt-6 space-y-3 rounded-md bg-surface-1 p-4 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-text-primary">
            <ShieldCheck className="h-4 w-4 text-status-success" />
            <span>Zero-trust GitHub authentication</span>
          </div>

          <ul className="space-y-2.5 text-text-secondary">
            <li className="flex items-start gap-2">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" />
              <span>
                <strong className="font-medium text-text-primary">
                  Public profile only:
                </strong>{" "}
                No repository access, no private emails, and no write
                permissions. GitHub&apos;s consent screen confirms{" "}
                <em>Public data only</em>.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" />
              <span>
                <strong className="font-medium text-text-primary">
                  PKCE &amp; zero token storage:
                </strong>{" "}
                Your GitHub OAuth token is discarded immediately after verifying
                your numeric GitHub ID.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Download className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" />
              <span>
                <strong className="font-medium text-text-primary">
                  Full data ownership:
                </strong>{" "}
                Notes default to Private. Export everything as Markdown ZIP or
                permanently delete your account anytime.
              </span>
            </li>
          </ul>
        </div>

        <p className="mt-5 text-center text-xs text-text-tertiary">
          Read our plain-language{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            Privacy &amp; Security Policy
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
