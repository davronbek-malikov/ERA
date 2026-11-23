import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type Breadcrumb = { label: string; href?: string };

type PageHeaderProps = {
  title: string;
  description?: React.ReactNode;
  /** Small label above the title, for example the workspace or course name. */
  eyebrow?: React.ReactNode;
  /** Shown from tablet up; on phones the back button in the top bar takes over. */
  breadcrumbs?: Breadcrumb[];
  /** One primary action at most, plus secondary actions. */
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, eyebrow, breadcrumbs, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 pb-6 md:flex-row md:items-end md:justify-between", className)}>
      <div className="flex min-w-0 flex-col gap-2">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="hidden md:block">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {breadcrumbs.map((crumb, index) => (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                  {index > 0 ? <ChevronRight className="size-3" aria-hidden="true" /> : null}
                  {crumb.href ? (
                    <Link href={crumb.href} className="hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-foreground">
                      {crumb.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        {eyebrow ? <p className="eyebrow-label text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-lead">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
