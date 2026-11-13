import Link from "next/link";
import { cookies } from "next/headers";

interface TagPageProps {
  params: Promise<{ tag: string }>;
}

interface TagNoteHit {
  id: number;
  title: string;
  slug: string;
  author_username: string;
  visibility: string;
  tags: string[];
  snippet: string;
}

export default async function TagPage({ params }: TagPageProps) {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let results: TagNoteHit[] = [];
  let total = 0;

  try {
    const res = await fetch(
      `${backendUrl}/api/v1/search?tag=${encodeURIComponent(decodedTag)}&limit=50`,
      {
        headers: cookieHeader ? { Cookie: cookieHeader } : {},
        cache: "no-store",
      }
    );
    if (res.ok) {
      const data = await res.json();
      results = data.results || [];
      total = data.total || 0;
    }
  } catch {
    results = [];
  }

  return (
    <div className="mx-auto max-w-[68ch] py-8">
      <header className="mb-6 border-b border-border pb-4">
        <p className="mb-1 font-mono text-xs uppercase tracking-wider text-text-muted">
          Topic
        </p>
        <h1 className="font-sans text-3xl font-semibold tracking-tight text-text">
          #{decodedTag}
        </h1>
        <p className="mt-1 font-mono text-xs text-text-muted">
          {total} {total === 1 ? "note" : "notes"}
        </p>
      </header>

      {results.length === 0 ? (
        <p className="font-mono text-sm text-text-muted">
          No visible notes tagged with #{decodedTag}.
        </p>
      ) : (
        <ul className="divide-y divide-border border-b border-border">
          {results.map((hit) => (
            <li key={hit.id} className="py-4">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <Link
                  href={`/u/${hit.author_username}/${hit.slug}`}
                  className="font-sans text-lg font-medium text-accent hover:underline"
                >
                  {hit.title}
                </Link>
                <span className="shrink-0 font-mono text-xs text-text-muted">
                  <Link href={`/u/${hit.author_username}`} className="hover:text-text">
                    @{hit.author_username}
                  </Link>
                  {hit.visibility === "private" && (
                    <span className="ml-2 text-warn">private</span>
                  )}
                </span>
              </div>
              {hit.snippet && (
                <p className="text-sm text-text-muted">{hit.snippet}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

