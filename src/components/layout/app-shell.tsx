"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { EraLogo } from "@/components/brand/era-logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * One shell for the Student, Teacher and Admin workspaces
 * (docs/ERA_INFORMATION_ARCHITECTURE.md §4).
 *
 * Navigation items are decided on the server, using the same policy functions that guard
 * each page. Showing or hiding an item here is UX only and never grants access.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Small count, for example submissions waiting for review. */
  count?: number;
  /** Match nested routes as active (default true). */
  matchNested?: boolean;
};

export type NavGroup = { label?: string; items: NavItem[] };

type AppShellProps = {
  /** Shown under the logo, for example "Teacher". */
  workspaceLabel: string;
  homeHref: string;
  nav: NavGroup[];
  /** Up to five items. Leave out for the Admin workspace (it uses the drawer only). */
  mobileTabs?: NavItem[];
  /** Right side of the top bar: search, notifications, assistant toggle, account menu. */
  topBarActions?: React.ReactNode;
  /** The assistant panel, docked on wide screens (see components/assistant). */
  assistant?: React.ReactNode;
  children: React.ReactNode;
};

function isActive(pathname: string, item: NavItem) {
  if (pathname === item.href) {
    return true;
  }

  return (item.matchNested ?? true) && pathname.startsWith(`${item.href}/`);
}

function SidebarNav({ nav, collapsed, onNavigate }: { nav: NavGroup[]; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {nav.map((group, groupIndex) => (
        <div key={group.label ?? groupIndex} className="flex flex-col gap-1">
          {group.label && !collapsed ? (
            <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{group.label}</p>
          ) : null}
          {group.items.map((item) => {
            const active = isActive(pathname, item);
            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-fast [&_svg]:size-4 [&_svg]:shrink-0",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  collapsed && "justify-center px-0"
                )}
              >
                {item.icon}
                <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
                {item.count && !collapsed ? (
                  <span className="ml-auto rounded-full bg-primary/10 px-1.5 text-xs tabular-nums text-primary">
                    {item.count}
                  </span>
                ) : null}
              </Link>
            );

            return collapsed ? (
              <Tooltip key={item.href} content={item.label} side="right">
                {link}
              </Tooltip>
            ) : (
              link
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function MobileTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-header border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.slice(0, 5).map((item) => {
          const active = isActive(pathname, item);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium [&_svg]:size-5",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.icon}
                <span className="max-w-full truncate px-1">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell({
  workspaceLabel,
  homeHref,
  nav,
  mobileTabs,
  topBarActions,
  assistant,
  children
}: AppShellProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:shadow-panel"
      >
        Skip to content
      </a>

      {/* Desktop sidebar (tablet shows the icon rail). */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col gap-6 border-r border-border bg-card px-3 py-4 md:flex",
          collapsed ? "w-sidebar-rail" : "w-sidebar-rail lg:w-sidebar"
        )}
      >
        <Link href={homeHref} className={cn("flex items-center gap-2 px-2", collapsed && "justify-center px-0")}>
          <EraLogo className="size-7" />
          <span className={cn("hidden flex-col leading-tight lg:flex", collapsed && "lg:hidden")}>
            <span className="text-sm font-semibold">ERA Academy</span>
            <span className="text-xs text-muted-foreground">{workspaceLabel}</span>
          </span>
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Below lg the rail is always collapsed. */}
          <div className="lg:hidden">
            <SidebarNav nav={nav} collapsed />
          </div>
          <div className="hidden lg:block">
            <SidebarNav nav={nav} collapsed={collapsed} />
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden self-end lg:inline-flex"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-header flex h-header items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:px-6">
          {/* Phones: workspaces without a tab bar (Admin) open the full menu in a drawer. */}
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className={cn("md:hidden", mobileTabs && "hidden")} aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" title={workspaceLabel}>
              <SidebarNav nav={nav} collapsed={false} onNavigate={() => setDrawerOpen(false)} />
            </SheetContent>
          </Sheet>
          <Link href={homeHref} className="flex items-center gap-2 md:hidden">
            <EraLogo className="size-6" />
            <span className="text-sm font-semibold">{workspaceLabel}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">{topBarActions}</div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main id="main-content" tabIndex={-1} className={cn("min-w-0 flex-1 focus:outline-none", mobileTabs && "pb-20 md:pb-0")}>
            {children}
          </main>
          {assistant}
        </div>
      </div>

      {mobileTabs ? <MobileTabBar items={mobileTabs} /> : null}
    </div>
  );
}

/** Standard page body inside a workspace: padding and maximum width. */
export function WorkspacePage({ children, className, width = "default" }: { children: React.ReactNode; className?: string; width?: "default" | "narrow" | "full" }) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-6 md:px-6 lg:px-8 lg:py-8",
        width === "default" && "max-w-content",
        width === "narrow" && "max-w-narrow",
        className
      )}
    >
      {children}
    </div>
  );
}
