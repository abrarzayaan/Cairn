import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Metadata } from "next";

interface PageProps {
  params: Promise<{
    user: string;
    slug: string;
  }>;
}

interface PathNode {
  key: string;
  id: number | null;
  title: string;
  slug: string | null;
  author_username: string | null;
  status: "ok" | "missing" | "private";
  depth: number;
  is_root: boolean;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { user, slug } = await params;
  return {
    title: `Reading path: ${slug} by @${user} · Cairn`,
  };
}

export default async function ReadingPathPage({ params }: PageProps) {
  const { user, slug } = await params;
  const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let res;
  try {
    res = await fetch(`${backendUrl}/api/v1/notes/by-slug/${user}/${slug}/path`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
  } catch {
    notFound();
  }

  if (res.status === 404 || !res.ok) {
    notFound();
  }

  const data = await res.json();
  const root: PathNode = data.root;
  const steps: PathNode[] = data.steps || [];
  const warnings: string[] = data.warnings || [];

  if (data.redirected && root.slug && root.slug !== slug) {
    redirect(`/u/${user}/${root.slug}/path`);
  }

  return (
    <div className="mx-auto max-w-[68ch] py-8">
      <header className="mb-6 border-b border-border pb-4">
        <div className="mb-2 font-mono text-xs text-text-muted">
          <Link href={`/u/${user}/${root.slug || slug}`} className="hover:text-accent">
            &larr; Back to {root.title}
          </Link>
        </div>
        <h1 className="font-sans text-2xl font-semibold tracking-tight text-text">
          Reading path to {root.title}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Ordered prerequisites from foundational concepts to{" "}
          <span className="font-medium text-text">{root.title}</span>.
        </p>
      </header>

      {warnings.length > 0 && (
        <div className="mb-6 rounded-md border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
          <ul className="space-y-1">
            {warnings.map((w, idx) => (
              <li key={idx} className="font-mono text-xs">
                &#9888; {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={`flex items-baseline justify-between gap-4 rounded-md border p-3.5 ${
              step.is_root
                ? "border-accent/50 bg-accent-bg/40"
                : "border-border bg-bg-subtle"
            }`}
          >
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs font-semibold text-text-muted">
                {index + 1}.
              </span>
              {step.status === "ok" && step.slug && step.author_username ? (
                <Link
                  href={`/u/${step.author_username}/${step.slug}`}
                  className="font-sans text-base font-medium text-accent hover:underline"
                >
                  {step.title}
                </Link>
              ) : step.status === "private" ? (
                <span className="font-mono text-sm text-warn">Private note</span>
              ) : (
                <span className="font-sans text-base text-text-muted">
                  {step.title}
                </span>
              )}
            </div>

            <div className="shrink-0 font-mono text-[11px] text-text-muted">
              {step.is_root ? (
                <span className="font-semibold text-accent">target</span>
              ) : step.status === "missing" ? (
                <span>not written yet</span>
              ) : step.status === "private" ? (
                <span className="text-warn">private</span>
              ) : (
                <span>@{step.author_username}</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

