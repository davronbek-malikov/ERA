import Link from "next/link";

import { signOutAction } from "@/app/(public)/sign-in/actions";
import { TrackedLink } from "@/components/analytics/tracked-link";
import { EraLogo } from "@/components/brand/era-logo";
import { Container } from "@/components/layout/container";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { cn } from "@/lib/utils";

type NavbarProps = {
  user?: Awaited<ReturnType<typeof getCurrentUser>> | null;
};

export async function Navbar({ user: initialUser }: NavbarProps) {
  const user = initialUser ?? (await getCurrentUser());
  const locale = await getLocale();
  const t = getMessages(locale);
  const dashboardHref =
    user?.role === "ADMIN" || user?.role === "INSTRUCTOR" ? "/admin" : "/my-learning";
  const navItems = [
    { href: "/subjects", label: t.navbar.subjects },
    { href: "/courses", label: t.navbar.courses },
    { href: "/#paths", label: t.navbar.learningPaths },
    { href: "/#faq", label: t.navbar.faq }
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/88 backdrop-blur-xl">
      <Container className="py-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-border/70 bg-white/88 px-5 py-3 shadow-soft xl:flex-nowrap 2xl:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <div className="rounded-2xl bg-accent p-1.5 shadow-soft">
              <EraLogo className="h-11 w-11" />
            </div>
            <div>
              <p className="font-display text-xl font-semibold">ERA Academy</p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/85">
                {t.navbar.brandTagline}
              </p>
            </div>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-secondary/70 p-1 lg:flex xl:mx-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className="whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:text-foreground xl:px-4"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center justify-end gap-2.5 md:flex md:flex-wrap xl:flex-nowrap">
            <LanguageSwitcher
              locale={locale}
              label={t.language.short}
              englishLabel={t.language.english}
              uzbekLabel={t.language.uzbek}
            />
            {user ? (
              <>
                <div className="min-w-[180px] rounded-[1.35rem] border border-border bg-secondary/55 px-4 py-2.5 text-sm leading-snug xl:min-w-[200px]">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {t.navbar.signedInAs}
                  </p>
                  <p className="mt-1 truncate font-medium text-foreground">{user.name}</p>
                </div>
                <Link
                  href={dashboardHref}
                  prefetch
                  className={cn(buttonVariants({ variant: "ghost" }), "shrink-0 whitespace-nowrap")}
                >
                  {user.role === "STUDENT" ? t.navbar.myLearning : t.navbar.dashboard}
                </Link>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className={cn(buttonVariants({ variant: "outline" }), "shrink-0 whitespace-nowrap")}
                  >
                    {t.navbar.signOut}
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  prefetch
                  className={cn(buttonVariants({ variant: "ghost" }), "shrink-0 whitespace-nowrap")}
                >
                  {t.navbar.signIn}
                </Link>
                <Link
                  href="/sign-up"
                  prefetch
                  className={cn(buttonVariants({ variant: "ghost" }), "shrink-0 whitespace-nowrap")}
                >
                  {t.navbar.signUp}
                </Link>
                <TrackedLink
                  href="/courses"
                  className={cn(buttonVariants({}), "shrink-0 whitespace-nowrap")}
                  eventName="cta_click"
                  eventData={{ location: "navbar", cta: "start_learning" }}
                >
                  {t.navbar.startLearning}
                </TrackedLink>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:hidden">
          <LanguageSwitcher
            locale={locale}
            label={t.language.short}
            englishLabel={t.language.english}
            uzbekLabel={t.language.uzbek}
          />
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-white hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-2 sm:flex-row">
            {user ? (
              <>
                <div className="rounded-2xl border border-border bg-white/85 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">{t.navbar.signedInAs} </span>
                  <span className="font-medium text-foreground">{user.name}</span>
                </div>
                <Link href={dashboardHref} prefetch className={cn(buttonVariants({ variant: "ghost" }))}>
                  {user.role === "STUDENT" ? t.navbar.myLearning : t.navbar.dashboard}
                </Link>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className={cn(buttonVariants({ variant: "outline" }), "w-full")}
                  >
                    {t.navbar.signOut}
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/sign-in" prefetch className={cn(buttonVariants({ variant: "ghost" }))}>
                  {t.navbar.signIn}
                </Link>
                <Link href="/sign-up" prefetch className={cn(buttonVariants({ variant: "ghost" }))}>
                  {t.navbar.signUp}
                </Link>
                <TrackedLink
                  href="/courses"
                  className={cn(buttonVariants({}))}
                  eventName="cta_click"
                  eventData={{ location: "navbar_mobile", cta: "start_learning" }}
                >
                  {t.navbar.startLearning}
                </TrackedLink>
              </>
            )}
          </div>
        </div>
      </Container>
    </header>
  );
}
