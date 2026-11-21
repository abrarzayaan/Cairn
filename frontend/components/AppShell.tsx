"use client";

import { Suspense, useEffect, useState } from "react";
import { Category, fetchCategories, fetchMe, User } from "@/lib/api";
import Navbar from "@/components/Navbar";
import NavigationProgress from "@/components/NavigationProgress";
import Sidebar from "@/components/Sidebar";
import { TooltipProvider } from "@/components/ui/Tooltip";

const SIDEBAR_STORAGE_KEY = "cairn-sidebar-collapsed";

export default function AppShell({
  initialTheme,
  children,
}: {
  initialTheme?: string;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (saved === "true") setCollapsed(true);
    } catch {
      // Ignore storage errors
    }

    fetchMe()
      .then((res) => {
        if (res.authenticated && res.user) {
          setUser(res.user);
          return fetchCategories().then((cats) => setCategories(cats));
        }
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const handleToggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <div className="flex min-h-screen flex-col bg-surface-0 text-text-primary">
        <Navbar
          initialTheme={initialTheme}
          user={user}
          authLoading={authLoading}
          onOpenMobileMenu={() => setMobileOpen(true)}
        />

        <div className="flex flex-1">
          <Sidebar
            user={user}
            categories={categories}
            onCategoryCreated={(cat) =>
              setCategories((prev) => [...prev, cat])
            }
            collapsed={collapsed}
            onToggleCollapse={handleToggleCollapse}
            mobileOpen={mobileOpen}
            onMobileOpenChange={setMobileOpen}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <main id="main-content" className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
              {children}
            </main>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-4 py-4 text-xs text-text-tertiary sm:px-8">
              <div>Cairn &middot; Linked notes for developers</div>
              <div className="flex gap-4">
                <a href="/about" className="hover:text-text-primary">
                  About
                </a>
                <a href="/terms" className="hover:text-text-primary">
                  Terms
                </a>
                <a href="/privacy" className="hover:text-text-primary">
                  Privacy
                </a>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
