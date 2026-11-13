import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Metadata } from "next";
import NoteContent from "@/components/NoteContent";
import NoteOwnerActions from "@/components/NoteOwnerActions";

interface PageProps {
  params: Promise<{
    user: string;
    slug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { user, slug } = await params;
  return {
    title: `${slug} by @${user} · Cairn`,
  };
}

export default async function NotePage({ params }: PageProps) {
  const { user, slug } = await params;
  const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000";
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let res;
  try {
    res = await fetch(`${backendUrl}/api/v1/notes/by-slug/${user}/${slug}`, {
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
  const note = data.note;
  const directPrereqs = data.direct_prereqs || [];

  // Handle slug history redirect
  if (data.redirected && note.slug !== slug) {
    redirect(`/u/${user}/${note.slug}`);
  }

  // Fetch viewer-filtered backlinks
  let backlinks = [];
  try {
    const blRes = await fetch(`${backendUrl}/api/v1/notes/${note.id}/backlinks`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (blRes.ok) {
      backlinks = await blRes.json();
    }
  } catch {
    // Backlinks fail gracefully
  }

  const isPrivate = note.visibility === "private";
  const updatedDate = new Date(note.updated_at).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <article className="mx-auto max-w-[68ch] py-8">
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="mb-2 font-sans text-3xl font-semibold tracking-tight text-text">
          {note.title}
        </h1>
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-text-muted">
          <span className={isPrivate ? "text-warn font-semibold" : "text-ok"}>
            {note.visibility}
          </span>
          <span>&middot;</span>
          <span>updated {updatedDate}</span>
          <span>&middot;</span>
          <Link href={`/u/${note.author_username}`} className="hover:text-text">
            @{note.author_username}
          </Link>
          <NoteOwnerActions authorUsername={note.author_username} slug={note.slug} />
          {note.tags && note.tags.length > 0 && (
            <>
              <span>&middot;</span>
              <div className="flex gap-2">
                {note.tags.map((tag: string) => (
                  <Link
                    key={tag}
                    href={`/tags/${encodeURIComponent(tag)}`}
                    className="text-text-muted hover:text-accent"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      {directPrereqs.length > 0 && (
        <aside className="mb-8 rounded-md border border-border bg-bg-subtle p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
              Read first
            </h2>
            <Link
              href={`/u/${user}/${note.slug}/path`}
              className="font-mono text-xs text-accent hover:underline"
            >
              View full reading path &rarr;
            </Link>
          </div>
          <ul className="space-y-1.5 text-sm">
            {directPrereqs.map((prereq: {
              key: string;
              title: string;
              slug: string | null;
              author_username: string | null;
              status: string;
            }) => (
              <li key={prereq.key} className="flex items-center gap-2">
                <span className="font-mono text-xs text-text-muted">&rarr;</span>
                {prereq.status === "ok" && prereq.slug && prereq.author_username ? (
                  <Link
                    href={`/u/${prereq.author_username}/${prereq.slug}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {prereq.title}
                  </Link>
                ) : prereq.status === "private" ? (
                  <span className="font-mono text-xs text-warn">Private note</span>
                ) : (
                  <span className="text-text-muted">
                    {prereq.title}{" "}
                    <span className="font-mono text-[11px]">(not written yet)</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </aside>
      )}

      <NoteContent html={note.content_html} backlinks={backlinks} />
    </article>
  );
}
