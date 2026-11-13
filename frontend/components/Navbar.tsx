"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchMe, logoutUser, User } from "@/lib/api";
import SearchPalette from "@/components/SearchPalette";
import ThemeToggle from "@/components/ThemeToggle";

export default function Navbar({ initialTheme }: { initialTheme?: string }) {
  const pathname = usePathname();
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
      <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex h-12 max-w-[1280px] items-center justify-between gap-2 px-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 font-mono text-base font-semibold tracking-tight text-text hover:no-underline"
            >
              <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-accent" />
              <span>cairn</span>
            </Link>

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex h-8 items-center gap-3 rounded border border-border-strong bg-bg-subtle px-2.5 font-mono text-xs text-text-muted transition-colors hover:border-text-muted hover:text-text"
            >
              <span>Search docs, books, @devs...</span>
              <kbd className="hidden rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-text-muted sm:inline">
                Ctrl+K
              </kbd>
            </button>
            <Link
              href="/search"
              className={`hidden rounded px-2 py-1 font-mono text-xs transition-colors sm:inline-flex ${
                pathname === "/search"
                  ? "bg-bg-inset font-medium text-text"
                  : "text-text-muted hover:bg-bg-subtle hover:text-text"
              }`}
            >
              Explore
            </Link>
          </div>

          <nav
            className="flex items-center gap-1.5 text-xs sm:gap-2.5 sm:text-sm"
            aria-label="Main Navigation"
          >
            <ThemeToggle initialTheme={initialTheme} />

            {!loading && (
              <>
                {user ? (
                  <>
                    <Link
                      href="/new"
                      className={`inline-flex h-7 items-center rounded border px-2.5 font-mono text-xs font-medium transition-colors hover:no-underline ${
                        pathname === "/new"
                          ? "border-accent bg-accent text-bg"
                          : "border-text bg-text text-bg hover:bg-text-muted hover:border-text-muted"
                      }`}
                    >
                      + New
                    </Link>
                    <Link
                      href={`/u/${user.username}`}
                      className={`hidden rounded px-2 py-1 font-mono text-xs transition-colors sm:inline-flex ${
                        pathname.startsWith(`/u/${user.username}`)
                          ? "bg-bg-inset text-text font-medium"
                          : "text-text-muted hover:bg-bg-subtle hover:text-text"
                      }`}
                    >
                      @{user.username}
                    </Link>
                    <Link
                      href="/settings"
                      className={`rounded px-2 py-1 font-mono text-xs transition-colors ${
                        pathname === "/settings"
                          ? "bg-bg-inset text-text font-medium"
                          : "text-text-muted hover:bg-bg-subtle hover:text-text"
                      }`}
                    >
                      Settings
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="inline-flex h-7 items-center rounded border border-border-strong bg-bg px-2 font-mono text-xs text-text-muted transition-colors hover:bg-bg-subtle hover:text-text"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <Link
                    href="/login"
                    className="inline-flex h-7 items-center justify-center rounded border border-text bg-text px-3 font-mono text-xs font-medium text-bg hover:border-text-muted hover:bg-text-muted hover:no-underline"
                  >
                    Sign in with GitHub
                  </Link>
                )}
              </>
            )}
          </nav>
        </div>
      </header>

      <SearchPalette
        currentUsername={user?.username}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </>
  );
}
