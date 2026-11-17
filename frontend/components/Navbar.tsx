"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Avatar from "@radix-ui/react-avatar";
import {
  ChevronDown,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  User as UserIcon,
} from "lucide-react";
import { logoutUser, User } from "@/lib/api";
import SearchPalette from "@/components/SearchPalette";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/Button";

interface NavbarProps {
  initialTheme?: string;
  user: User | null;
  authLoading: boolean;
  onOpenMobileMenu: () => void;
}

export default function Navbar({
  initialTheme,
  user,
  authLoading,
  onOpenMobileMenu,
}: NavbarProps) {
  const [searchOpen, setSearchOpen] = useState(false);

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
    window.location.href = "/";
  };

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "?";

  return (
    <>
      <header className="sticky top-0 z-40 h-12 border-b border-border-subtle bg-surface-0/95 backdrop-blur-sm">
        <div className="flex h-full items-center justify-between gap-3 px-3 sm:px-5">
          {/* Left: Mobile drawer trigger + Brand Logo */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenMobileMenu}
              className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary md:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>

            <Link
              href="/"
              className="flex items-center gap-2 font-sans text-sm font-semibold tracking-tight text-text-primary hover:no-underline"
            >
              <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-accent" />
              <span>cairn</span>
            </Link>
          </div>

          {/* Center: Prominent Search Trigger */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-8 w-full max-w-md items-center justify-between gap-2 rounded-sm border border-border-default bg-surface-1 px-3 text-xs text-text-tertiary transition-colors hover:border-border-strong hover:text-text-secondary"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Search docs, books, @devs...</span>
            </span>
            <kbd className="hidden rounded-sm border border-border-default bg-surface-0 px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary sm:inline">
              Ctrl+K
            </kbd>
          </button>

          {/* Right: Theme Toggle + Primary Actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle initialTheme={initialTheme} />

            {!authLoading && (
              <>
                {user ? (
                  <>
                    <Button asChild size="sm" variant="primary">
                      <Link href="/new" className="hover:no-underline">
                        <Plus className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">New</span>
                      </Link>
                    </Button>

                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1.5 rounded-sm px-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          aria-label="Account menu"
                        >
                          <Avatar.Root className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-accent-light text-[11px] font-semibold text-accent">
                            <Avatar.Fallback delayMs={0}>
                              {initials}
                            </Avatar.Fallback>
                          </Avatar.Root>
                          <ChevronDown className="hidden h-3.5 w-3.5 text-text-tertiary sm:inline" />
                        </button>
                      </DropdownMenu.Trigger>

                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          align="end"
                          sideOffset={6}
                          className="z-50 min-w-[180px] rounded-md border border-border-default bg-surface-0 p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
                        >
                          <div className="px-2.5 py-1.5 text-xs font-medium text-text-tertiary">
                            @{user.username}
                          </div>
                          <DropdownMenu.Separator className="my-1 h-px bg-border-subtle" />

                          <DropdownMenu.Item asChild>
                            <Link
                              href={`/u/${user.username}`}
                              className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs font-medium text-text-primary outline-none hover:bg-surface-2 hover:no-underline focus:bg-surface-2"
                            >
                              <UserIcon className="h-3.5 w-3.5 text-text-tertiary" />
                              <span>Profile</span>
                            </Link>
                          </DropdownMenu.Item>

                          <DropdownMenu.Item asChild>
                            <Link
                              href="/settings"
                              className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs font-medium text-text-primary outline-none hover:bg-surface-2 hover:no-underline focus:bg-surface-2"
                            >
                              <Settings className="h-3.5 w-3.5 text-text-tertiary" />
                              <span>Settings</span>
                            </Link>
                          </DropdownMenu.Item>

                          <DropdownMenu.Separator className="my-1 h-px bg-border-subtle" />

                          <DropdownMenu.Item
                            onSelect={handleLogout}
                            className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs font-medium text-status-danger outline-none hover:bg-surface-2 focus:bg-surface-2"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                            <span>Sign out</span>
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </>
                ) : (
                  <Button asChild size="sm" variant="primary">
                    <Link href="/login" className="hover:no-underline">
                      Sign in
                    </Link>
                  </Button>
                )}
              </>
            )}
          </div>
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
