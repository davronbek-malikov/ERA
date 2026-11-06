"use client";

import Link from "next/link";
import { BookOpen, ChevronRight, Globe2, GraduationCap, Info, LayoutPanelLeft, Menu, Route, Sparkles } from "lucide-react";

import { EraLogo } from "@/components/brand/era-logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  description?: string;
};

type PublicNavDrawerProps = {
  locale: "en" | "uz";
  title: string;
  description: string;
  primaryItems: NavItem[];
  secondaryItems: NavItem[];
  languageLabel: string;
  englishLabel: string;
  uzbekLabel: string;
  cta?: {
    href: string;
    label: string;
  };
};

export function PublicNavDrawer({
  locale,
  title,
  description,
  primaryItems,
  secondaryItems,
  languageLabel,
  englishLabel,
  uzbekLabel,
  cta
}: PublicNavDrawerProps) {
  const iconByHref: Record<string, typeof BookOpen> = {
    "/subjects": LayoutPanelLeft,
    "/courses": BookOpen,
    "/learning-paths": Route,
    "/about": Info,
    "/faq": Sparkles,
    "/my-learning": GraduationCap,
    "/learn": GraduationCap,
    "/teacher": GraduationCap,
    "/admin": GraduationCap
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 gap-2 shadow-soft">
          <Menu className="h-4 w-4" />
          {locale === "uz" ? "Menyu" : "Menu"}
        </Button>
      </DialogTrigger>
      <DialogContent className="left-0 top-0 h-screen w-[min(88vw,22rem)] translate-x-0 translate-y-0 rounded-none rounded-r-[1.75rem] border-r border-border/80 p-0 shadow-[0_30px_80px_rgba(15,23,42,0.22)] data-[state=closed]:slide-out-to-left-full data-[state=open]:slide-in-from-left-full">
        <div className="flex h-full flex-col bg-card">
          <DialogHeader className="border-b border-border/70 px-6 pb-5 pt-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-accent p-2 shadow-soft">
                <EraLogo className="h-10 w-10" />
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-primary/10 bg-muted px-4 py-4 text-left shadow-soft">
              <p className="eyebrow-label text-muted-foreground">
                {locale === "uz" ? "Tartibli navigatsiya" : "Organized navigation"}
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {locale === "uz"
                  ? "Kerakli bo'limlarga tezroq o'ting va yuqori panelni toza saqlang."
                  : "Move quickly between key areas while keeping the top bar clean."}
              </p>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 py-5">
            <div className="mb-6">
              <p className="eyebrow-label mb-2 px-2 text-muted-foreground">
                {locale === "uz" ? "Til" : "Language"}
              </p>
              <LanguageSwitcher
                locale={locale}
                label={languageLabel}
                englishLabel={englishLabel}
                uzbekLabel={uzbekLabel}
              />
            </div>

            <div className="space-y-2">
              <p className="eyebrow-label px-2 text-muted-foreground">
                {locale === "uz" ? "Asosiy yo'nalishlar" : "Main areas"}
              </p>
              {primaryItems.map((item) => (
                <DialogClose asChild key={item.href}>
                  <Link
                    href={item.href}
                    prefetch
                    className="group block rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-accent/35"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-xl bg-secondary/70 p-2 text-primary transition-colors group-hover:bg-card">
                        {(() => {
                          const Icon = iconByHref[item.href] ?? BookOpen;
                          return <Icon className="h-4 w-4" />;
                        })()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground">{item.label}</p>
                          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </div>
                        {item.description ? (
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </DialogClose>
              ))}
            </div>

            {cta ? (
              <div className="mt-6">
                <p className="eyebrow-label mb-2 px-2 text-muted-foreground">
                  {locale === "uz" ? "Boshlash" : "Start here"}
                </p>
                <DialogClose asChild>
                  <Link
                    href={cta.href}
                    prefetch
                    className={cn(buttonVariants({ size: "lg" }), "w-full justify-center")}
                  >
                    {cta.label}
                  </Link>
                </DialogClose>
              </div>
            ) : null}

            <div className="mt-6 space-y-2">
              <p className="eyebrow-label px-2 text-muted-foreground">
                {locale === "uz" ? "Qo'shimcha sahifalar" : "More pages"}
              </p>
              {secondaryItems.map((item) => (
                <DialogClose asChild key={item.href}>
                  <Link
                    href={item.href}
                    prefetch
                    className="group flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-secondary/55"
                  >
                    <span className="inline-flex items-center gap-3">
                      {(() => {
                        const Icon = iconByHref[item.href] ?? Info;
                        return <Icon className="h-4 w-4 text-muted-foreground" />;
                      })()}
                      {item.label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </DialogClose>
              ))}
            </div>
          </div>

          <div className="border-t border-border/70 px-4 py-4">
            <DialogClose asChild>
              <button
                type="button"
                className={cn(buttonVariants({ variant: "ghost" }), "w-full justify-center")}
              >
                {locale === "uz" ? "Menyuni yopish" : "Close menu"}
              </button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
