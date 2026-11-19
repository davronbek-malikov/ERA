"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useDeferredValue, useState } from "react";

import type { FaqPageContent } from "@/lib/faq/content";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FaqBrowserProps = {
  content: FaqPageContent;
  supportEmail?: string | null;
};

export function FaqBrowser({ content, supportEmail }: FaqBrowserProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();

  const filteredCategories = content.categories
    .map((category) => {
      const items = content.items.filter((item) => {
        if (item.categoryId !== category.id) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const searchableText = [category.title, category.description, item.question, item.answer, ...item.keywords]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedQuery);
      });

      return {
        ...category,
        items
      };
    })
    .filter((category) => category.items.length > 0);

  const resultCount = filteredCategories.reduce((sum, category) => sum + category.items.length, 0);
  return (
    <div className="space-y-10">
      <div className="rounded-xl border border-border/70 bg-card/90 p-6 shadow-soft sm:p-8">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={content.searchPlaceholder}
            className="h-14 rounded-xl border-border/80 pl-12 text-base"
            aria-label={content.searchPlaceholder}
          />
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{content.searchHint}</p>
        {normalizedQuery ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              {resultCount} {resultCount === 1 ? "result" : "results"} for &quot;{deferredQuery}&quot;
            </span>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded-full border border-border bg-secondary/60 px-3 py-1.5 font-medium text-foreground transition hover:bg-secondary"
            >
              {content.resetLabel}
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        {content.categories.map((category) => (
          <a
            key={category.id}
            href={`#${category.id}`}
            className="rounded-full border border-border/80 bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition hover:-translate-y-0.5 hover:border-primary/25 hover:text-foreground"
          >
            {category.title}
          </a>
        ))}
      </div>

      {filteredCategories.length > 0 ? (
        <div className="space-y-8">
          {filteredCategories.map((category) => (
            <section
              key={category.id}
              id={category.id}
              aria-labelledby={`${category.id}-heading`}
              className="scroll-mt-28 space-y-4"
            >
              <div className="space-y-2">
                <h2 id={`${category.id}-heading`} className="font-display text-2xl font-semibold sm:text-3xl">
                  {category.title}
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                  {category.description}
                </p>
              </div>

              <div className="space-y-3">
                {category.items.map((item) => (
                  <details
                    key={item.id}
                    className="group rounded-xl border border-border/70 bg-card/92 shadow-soft transition hover:border-primary/20"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left marker:hidden sm:px-6 sm:py-5">
                      <span className="text-sm font-semibold leading-6 text-foreground sm:text-base">
                        {item.question}
                      </span>
                      <span className="text-2xl leading-none text-muted-foreground transition group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <div className="border-t border-border/60 px-5 pb-5 pt-4 sm:px-6">
                      <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                        {item.answer}
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="space-y-3 p-6 sm:p-8">
            <h2 className="font-display text-2xl font-semibold">{content.noResultsTitle}</h2>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              {content.noResultsDescription}
            </p>
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="support-heading">
        <Card className="overflow-hidden border-primary/10 bg-card">
          <CardContent className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.2fr,0.8fr] lg:items-center">
            <div className="space-y-3">
              <h2 id="support-heading" className="font-display text-2xl font-semibold sm:text-3xl">
                {content.supportTitle}
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                {content.supportDescription}
              </p>
            </div>
            <div className="space-y-4 rounded-xl border border-white/70 bg-card/85 p-5 shadow-soft">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {content.supportEmailLabel}
                </p>
                <p className="break-all text-sm font-medium text-foreground sm:text-base">
                  {supportEmail ?? "Support email will be shared by the ERA team."}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  href={supportEmail ? `mailto:${supportEmail}` : "/sign-in"}
                  className={cn(buttonVariants({}), "sm:flex-1")}
                >
                  {content.supportButtonLabel}
                </a>
                <Link href="/courses" className={cn(buttonVariants({ variant: "outline" }), "sm:flex-1")}>
                  Browse Courses
                </Link>
              </div>
              <p className="text-xs leading-6 text-muted-foreground">
                ERA Guide is available on public pages and can help with quick questions about login, courses, and navigation.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
