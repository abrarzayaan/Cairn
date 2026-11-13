"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchMe, logoutUser, User } from "@/lib/api";
import SearchPalette from "@/components/SearchPalette";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    fetchMe().then((res) => {
      if (res.authenticated && res.user) {
        setUser(res.user);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    window.location.href = "/";
  };

  return (
    <>
      <header className="sticky top-0 z-40 flex h-11 items-center justify-between border-b border-border bg-bg px-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-mono text-base font-semibold tracking-tight text-text hover:no-underline">
            cairn
          </Link>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex h-7 items-center gap-2 rounded border border-border-strong bg-bg-subtle px-2.5 font-mono text-xs text-text-muted hover:text-text"
          >
            <span>Search</span>
            <span className="text-[11px] opacity-75">Ctrl+K</span>
          </button>
        </div>

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

      <SearchPalette
        currentUsername={user?.username}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </>
  );
}

