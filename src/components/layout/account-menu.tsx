"use client";

import Link from "next/link";
import { ChevronDown, ExternalLink, LogOut, Repeat, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

type AccountMenuProps = {
  name: string;
  roleLabel: string;
  settingsHref?: string;
  /** Shown only to users with more than one workspace (admins who teach). */
  switchTo?: { href: string; label: string };
  labels: { viewSite: string; settings: string; signOut: string; account: string };
  signOutAction: () => Promise<void>;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AccountMenu({ name, roleLabel, settingsHref, switchTo, labels, signOutAction }: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-2 px-2" aria-label={`${labels.account}: ${name}`}>
          <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
            {initials(name)}
          </span>
          <span className="hidden max-w-[10rem] truncate text-sm sm:inline">{name}</span>
          <ChevronDown className="hidden sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-medium text-foreground">{name}</span>
          <span className="block">{roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {switchTo ? (
          <DropdownMenuItem asChild>
            <Link href={switchTo.href}>
              <Repeat /> {switchTo.label}
            </Link>
          </DropdownMenuItem>
        ) : null}
        {settingsHref ? (
          <DropdownMenuItem asChild>
            <Link href={settingsHref}>
              <Settings /> {labels.settings}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/">
            <ExternalLink /> {labels.viewSite}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut /> {labels.signOut}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
