import Link from "next/link";

import { signOutAction } from "@/app/(public)/sign-in/actions";
import { EraLogo } from "@/components/brand/era-logo";
import { Container } from "@/components/layout/container";
import { PublicNavDrawer } from "@/components/layout/public-nav-drawer";
import { buttonVariants } from "@/components/ui/button";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { cn } from "@/lib/utils";

type NavbarUser = {
  id?: string;
  name: string;
  role: string;
} | null;

type NavbarProps = {
  user?: NavbarUser;
};

export async function Navbar({ user: initialUser }: NavbarProps) {
  const user = initialUser ?? null;
  const locale = await getLocale();
  const t = getMessages(locale);
  // Each role's workspace. Display only: every workspace page checks access on the server.
  const dashboardHref = user?.role === "ADMIN" ? "/admin" : user?.role === "INSTRUCTOR" ? "/teacher" : "/learn";

  const drawerPrimaryItems = [
    {
      href: "/subjects",
      label: t.navbar.subjects,
      description:
        locale === "uz"
          ? "Asosiy fan yo'nalishlari va bo'limlarini ko'ring."
          : "Browse the main subject areas and learning tracks."
    },
    {
      href: "/courses",
      label: t.navbar.courses,
      description:
        locale === "uz"
          ? "Barcha kurslar katalogini ko'ring."
          : "Explore the full course catalog."
    },
    {
      href: "/learning-paths",
      label: t.navbar.learningPaths,
      description:
        locale === "uz"
          ? "Bosqichma-bosqich o'qish yo'llarini oching."
          : "Open the structured step-by-step learning paths."
    }
  ];

  const drawerSecondaryItems = [
    { href: "/about", label: t.footer.about },
    { href: "/faq", label: t.navbar.faq },
    ...(user
      ? [
          {
            href: dashboardHref,
            label: user.role === "STUDENT" ? t.navbar.myLearning : t.navbar.dashboard
          }
        ]
      : [])
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/88 backdrop-blur-xl">
      <Container className="py-3.5">
        <div className="rounded-2xl border border-border/70 bg-card/88 px-4 py-3 shadow-soft sm:px-5 2xl:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <PublicNavDrawer
                locale={locale}
                title={locale === "uz" ? "ERA navigatsiyasi" : "ERA navigation"}
                description={
                  locale === "uz"
                    ? "Barcha sahifalar, til sozlamalari va asosiy yo'nalishlar shu menyuda jamlangan."
                    : "All pages, language settings, and key learning areas are organized inside this menu."
                }
                primaryItems={drawerPrimaryItems}
                secondaryItems={drawerSecondaryItems}
                languageLabel={t.language.short}
                englishLabel={t.language.english}
                uzbekLabel={t.language.uzbek}
                cta={!user ? { href: "/courses", label: t.navbar.startLearning } : undefined}
              />

              <Link href="/" className="flex min-w-0 items-center gap-3">
                <div className="rounded-2xl bg-accent p-1.5 shadow-soft">
                  <EraLogo className="h-11 w-11" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-[1.15rem] font-semibold">ERA Academy</p>
                  <p className="hidden text-[11px] uppercase tracking-[0.22em] text-muted-foreground/85 sm:block">
                    {t.navbar.brandTagline}
                  </p>
                </div>
              </Link>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {user ? (
                <>
                  <Link
                    href={dashboardHref}
                    prefetch
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "whitespace-nowrap")}
                  >
                    {user.role === "STUDENT" ? t.navbar.myLearning : t.navbar.dashboard}
                  </Link>
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "whitespace-nowrap")}
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
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "whitespace-nowrap")}
                  >
                    {t.navbar.signIn}
                  </Link>
                  <Link
                    href="/sign-up"
                    prefetch
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "whitespace-nowrap")}
                  >
                    {t.navbar.signUp}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </Container>
    </header>
  );
}
