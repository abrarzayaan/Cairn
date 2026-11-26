"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as Separator from "@radix-ui/react-separator";
import {
  Compass,
  Folder,
  FolderPlus,
  Hash,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  User as UserIcon,
  X,
} from "lucide-react";
import { Category, createCategory, User } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Tooltip } from "@/components/ui/Tooltip";

interface SidebarProps {
  user: User | null;
  categories: Category[];
  onCategoryCreated?: (cat: Category) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const link = (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm font-medium transition-colors duration-150 hover:no-underline",
        active
          ? "bg-surface-2 text-text-primary"
          : "text-text-secondary hover:bg-surface-2/70 hover:text-text-primary",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          active ? "text-accent" : "text-text-tertiary",
        )}
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip content={label} side="right">
        {link}
      </Tooltip>
    );
  }
  return link;
}

export default function Sidebar({
  user,
  categories,
  onCategoryCreated,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileOpenChange,
}: SidebarProps) {
  const pathname = usePathname();
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setCatSaving(true);
    setCatError(null);
    try {
      const created = await createCategory({ name: catName.trim() });
      onCategoryCreated?.(created);
      setCatName("");
      setNewCatOpen(false);
    } catch (err) {
      setCatError(
        err instanceof Error ? err.message : "Could not create category.",
      );
    } finally {
      setCatSaving(false);
    }
  };

  const renderContent = (isMobile: boolean) => {
    const isCollapsed = !isMobile && collapsed;

    return (
      <div className="flex h-full flex-col justify-between bg-surface-1 px-2.5 py-3">
        <div className="space-y-4">
          {/* Primary Navigation */}
          <nav aria-label="Sidebar Navigation" className="space-y-1">
            <NavItem
              href="/"
              icon={Home}
              label="Home"
              active={pathname === "/"}
              collapsed={isCollapsed}
              onClick={() => isMobile && onMobileOpenChange(false)}
            />
            <NavItem
              href="/search"
              icon={Compass}
              label="Explore"
              active={pathname === "/search"}
              collapsed={isCollapsed}
              onClick={() => isMobile && onMobileOpenChange(false)}
            />
            <NavItem
              href="/search?type=notes"
              icon={Hash}
              label="Tags"
              active={pathname.startsWith("/tags")}
              collapsed={isCollapsed}
              onClick={() => isMobile && onMobileOpenChange(false)}
            />
          </nav>

          {/* Owner Desk Section */}
          {user && (
            <>
              <Separator.Root className="h-px bg-border-subtle" />
              <div className="space-y-1">
                {!isCollapsed && (
                  <div className="flex items-center justify-between px-2.5 pb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Desk
                    </span>
                    <Tooltip content="New category" side="right">
                      <button
                        type="button"
                        onClick={() => setNewCatOpen(true)}
                        className="rounded-sm p-0.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
                        aria-label="New category"
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                )}

                {categories.map((cat) => (
                  <NavItem
                    key={cat.id}
                    href={`/u/${user.username}?category=${encodeURIComponent(cat.slug)}`}
                    icon={Folder}
                    label={cat.name}
                    active={false}
                    collapsed={isCollapsed}
                    onClick={() => isMobile && onMobileOpenChange(false)}
                  />
                ))}

                {isCollapsed ? (
                  <Tooltip content="New category" side="right">
                    <button
                      type="button"
                      onClick={() => setNewCatOpen(true)}
                      className="flex w-full items-center justify-center rounded-sm py-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
                      aria-label="New category"
                    >
                      <FolderPlus className="h-4 w-4" />
                    </button>
                  </Tooltip>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNewCatOpen(true)}
                    className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-xs font-medium text-text-tertiary transition-colors hover:bg-surface-2/70 hover:text-text-primary"
                  >
                    <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                    <span>+ New category</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Bottom Section */}
        <div className="space-y-1">
          <Separator.Root className="mb-2 h-px bg-border-subtle" />
          {user && (
            <>
              <NavItem
                href="/settings"
                icon={Settings}
                label="Settings"
                active={pathname === "/settings"}
                collapsed={isCollapsed}
                onClick={() => isMobile && onMobileOpenChange(false)}
              />
              <NavItem
                href={`/u/${user.username}`}
                icon={UserIcon}
                label={`@${user.username}`}
                active={pathname.startsWith(`/u/${user.username}`)}
                collapsed={isCollapsed}
                onClick={() => isMobile && onMobileOpenChange(false)}
              />
            </>
          )}

          {!isMobile && (
            <Tooltip
              content={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              side="right"
            >
              <button
                type="button"
                onClick={onToggleCollapse}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-xs font-medium text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary",
                  isCollapsed && "justify-center px-0",
                )}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4 shrink-0" />
                ) : (
                  <>
                    <PanelLeftClose className="h-4 w-4 shrink-0" />
                    <span>Collapse</span>
                  </>
                )}
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sticky Collapsible Rail */}
      <aside
        style={{ width: collapsed ? 56 : 220 }}
        className="sticky top-12 hidden h-[calc(100vh-3rem)] shrink-0 overflow-hidden border-r border-border-subtle bg-surface-1 transition-[width] duration-150 ease-out md:block"
      >
        {renderContent(false)}
      </aside>

      {/* Mobile Drawer (Radix Dialog) */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 md:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[260px] border-r border-border-default bg-surface-1 shadow-xl focus:outline-none md:hidden">
            <div className="flex h-12 items-center justify-between border-b border-border-subtle px-4">
              <DialogPrimitive.Title className="text-sm font-semibold text-text-primary">
                Navigation
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                className="rounded-sm p-1 text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
            <div className="h-[calc(100%-3rem)] overflow-y-auto">
              {renderContent(true)}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Create Category Dialog */}
      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Desk Category</DialogTitle>
            <DialogDescription>
              Organize your books into personal shelf categories.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCategory} className="space-y-4">
            <div>
              <label
                htmlFor="sidebar-cat-name"
                className="mb-1.5 block text-xs font-medium text-text-secondary"
              >
                Category name
              </label>
              <input
                id="sidebar-cat-name"
                type="text"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="e.g. Distributed Systems"
                autoFocus
                className="w-full rounded-sm border border-border-default bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none"
              />
              {catError && (
                <p className="mt-1.5 text-xs text-status-danger">{catError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setNewCatOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={catSaving}
                disabled={!catName.trim()}
              >
                Create category
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
