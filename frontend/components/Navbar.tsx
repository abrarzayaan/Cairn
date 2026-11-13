"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchMe, logoutUser, User } from "@/lib/api";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe().then((res) => {
      if (res.authenticated && res.user) {
        setUser(res.user);
      }
      setLoading(false);
    });
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    window.location.href = "/";
  };

  return (
    <header className="sticky top-0 z-50 flex h-11 items-center justify-between border-b border-border bg-bg px-4">
      <Link href="/" className="font-mono text-base font-semibold tracking-tight text-text hover:no-underline">
        cairn
      </Link>

      <nav className="flex items-center gap-4 text-sm" aria-label="Main Navigation">
        {!loading && (
          <>
            {user ? (
              <>
                <Link href="/new" className="text-text hover:text-accent">
                  New
                </Link>
                <Link href={`/u/${user.username}`} className="font-mono text-text-muted hover:text-text">
                  @{user.username}
                </Link>
                <Link href="/settings" className="text-text hover:text-accent">
                  Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="inline-flex h-6 items-center justify-center rounded border border-border-strong bg-bg px-2 text-xs font-medium text-text hover:bg-bg-subtle"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex h-7 items-center justify-center rounded border border-text bg-text px-3 text-xs font-medium text-bg hover:bg-text-muted hover:border-text-muted hover:no-underline"
              >
                Sign in with GitHub
              </Link>
            )}
          </>
        )}
      </nav>
    </header>
  );
}

