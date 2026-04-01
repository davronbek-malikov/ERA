import Link from "next/link";
import {
  BookOpen,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  Settings,
  Users
} from "lucide-react";

import { signOutAction } from "@/app/(public)/sign-in/actions";
import { EraLogo } from "@/components/brand/era-logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Container } from "@/components/layout/container";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN", "INSTRUCTOR"] },
  { href: "/admin/subjects", label: "Subjects", icon: FolderKanban, roles: ["ADMIN"] },
  { href: "/admin/categories", label: "Categories", icon: FolderKanban, roles: ["ADMIN"] },
  { href: "/admin/courses", label: "Courses", icon: BookOpen, roles: ["ADMIN", "INSTRUCTOR"] },
  { href: "/admin/lessons", label: "Lessons", icon: BookOpen, roles: ["ADMIN", "INSTRUCTOR"] },
  { href: "/admin/materials", label: "Materials", icon: GraduationCap, roles: ["ADMIN", "INSTRUCTOR"] },
  { href: "/admin/progress", label: "Progress", icon: LineChart, roles: ["ADMIN", "INSTRUCTOR"] },
  { href: "/admin/instructors", label: "Instructors", icon: GraduationCap, roles: ["ADMIN"] },
  { href: "/admin/users", label: "Users", icon: Users, roles: ["ADMIN"] },
  { href: "/admin/settings", label: "Settings", icon: Settings, roles: ["ADMIN", "INSTRUCTOR"] }
];

type AdminShellProps = {
  children: React.ReactNode;
  currentPath?: string;
};

export async function AdminShell({ children, currentPath }: AdminShellProps) {
  const currentUser = await getCurrentUser();
  const locale = await getLocale();
  const t = getMessages(locale);
  const adminCopy =
    locale === "uz"
      ? {
          cms: "ERA CMS",
          instructorStudio: "Instruktor studiyasi",
          adminStudio: "Admin studiyasi",
          instructorDescription:
            "Biriktirilgan kurslar, darslar, materiallar va o'quvchi progressini boshqaring.",
          adminDescription:
            "Fanlar, katalog tuzilmasi, instruktorlar va o'quvchilarni boshqaring.",
          viewSite: "Saytni ko'rish",
          dashboard: "Boshqaruv paneli",
          subjects: "Fanlar",
          categories: "Kategoriyalar",
          courses: "Kurslar",
          lessons: "Darslar",
          materials: "Materiallar",
          progress: "Progress",
          instructors: "Instruktorlar",
          users: "Foydalanuvchilar",
          settings: "Sozlamalar"
        }
      : {
          cms: "ERA CMS",
          instructorStudio: "Instructor Studio",
          adminStudio: "Admin Studio",
          instructorDescription:
            "Manage your assigned courses, lessons, materials, and learner progress.",
          adminDescription: "Manage subjects, catalog structure, instructors, and learners.",
          viewSite: "View site",
          dashboard: "Dashboard",
          subjects: "Subjects",
          categories: "Categories",
          courses: "Courses",
          lessons: "Lessons",
          materials: "Materials",
          progress: "Progress",
          instructors: "Instructors",
          users: "Users",
          settings: "Settings"
        };
  const navLabels: Record<string, string> = {
    Dashboard: adminCopy.dashboard,
    Subjects: adminCopy.subjects,
    Categories: adminCopy.categories,
    Courses: adminCopy.courses,
    Lessons: adminCopy.lessons,
    Materials: adminCopy.materials,
    Progress: adminCopy.progress,
    Instructors: adminCopy.instructors,
    Users: adminCopy.users,
    Settings: adminCopy.settings
  };
  const visibleNavItems = navItems.filter((item) => item.roles.includes(currentUser?.role ?? ""));

  return (
    <Container className="py-10">
      <div className="grid gap-8 lg:grid-cols-[260px,1fr]">
        <aside className="h-fit rounded-[1.75rem] border border-white/60 bg-white/85 p-5 shadow-soft">
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-white p-1 shadow-soft">
                <EraLogo className="h-12 w-12" />
              </div>
              <div>
                <p className="font-display text-3xl">{adminCopy.cms}</p>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {currentUser?.role === "INSTRUCTOR"
                    ? adminCopy.instructorStudio
                    : adminCopy.adminStudio}
                </p>
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {currentUser?.role === "INSTRUCTOR"
                ? adminCopy.instructorDescription
                : adminCopy.adminDescription}
            </p>
          </div>

          {currentUser ? (
            <div className="mb-6 rounded-2xl border border-border bg-secondary/35 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">{currentUser.name}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {currentUser.role}
              </p>
            </div>
          ) : null}

          <div className="mb-6">
            <LanguageSwitcher
              locale={locale}
              label={t.language.short}
              englishLabel={t.language.english}
              uzbekLabel={t.language.uzbek}
            />
          </div>

          <div className="mb-6 flex gap-2">
            <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              {adminCopy.viewSite}
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                {t.navbar.signOut}
              </button>
            </form>
          </div>

          <nav className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = currentPath === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-3 rounded-2xl px-4 py-3 text-sm transition",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {navLabels[item.label] ?? item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="space-y-8">{children}</div>
      </div>
    </Container>
  );
}
