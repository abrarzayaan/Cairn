"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchMe, User } from "@/lib/api";

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetchMe().then((res) => {
      if (res.authenticated && res.user) {
        setUser(res.user);
      }
    });
  }, []);

  return (
    <div className="mx-auto max-w-[680px] py-10">
      <h1 className="mb-3 font-mono text-3xl font-semibold tracking-tight text-text">
        devbook
      </h1>
      <p className="mb-2 text-lg leading-relaxed text-text">
        Linked notes for developers.
      </p>
      <p className="mb-6 text-sm text-text-muted">
        Write what you learn. Link what depends on what.
      </p>

      <div className="mb-8">
        {!user ? (
          <Link
            href="/login"
            className="inline-flex h-9 items-center justify-center rounded border border-text bg-text px-4 text-sm font-medium text-bg hover:bg-text-muted hover:border-text-muted hover:no-underline"
          >
            Sign in with GitHub
          </Link>
        ) : (
          <Link
            href="/new"
            className="inline-flex h-9 items-center justify-center rounded border border-text bg-text px-4 text-sm font-medium text-bg hover:bg-text-muted hover:border-text-muted hover:no-underline"
          >
            New note
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 border-t border-border pt-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-text-muted">
            Recently updated
          </h2>
          <p className="text-sm text-text-muted">No public notes yet.</p>
        </div>
        <div>
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-text-muted">
            Topics
          </h2>
          <p className="text-sm text-text-muted">No topics yet.</p>
        </div>
      </div>
    </div>
  );
}
