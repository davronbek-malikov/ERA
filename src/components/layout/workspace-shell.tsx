import { BarChart3, BookOpen, BookOpenCheck, ClipboardCheck, Compass, FileStack, FolderTree, GraduationCap, Home, LayoutDashboard, Library, LineChart, Settings, Sparkles, Tags, Users } from "lucide-react";

import { signOutAction } from "@/app/(public)/sign-in/actions";
import { AccountMenu } from "@/components/layout/account-menu";
import { AppShell, type NavGroup, type NavItem } from "@/components/layout/app-shell";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { getCurrentUser } from "@/lib/auth";
import { getMessages, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import type { WorkspaceKind } from "@/server/workspace";

/*
 * Navigation for each workspace (docs/ERA_INFORMATION_ARCHITECTURE.md §4.3).
 * These lists are UX only. Every page checks access on the server (src/server/workspace.ts).
 */

const copy = {
  en: {
    workspace: { student: "Student", teacher: "Teacher", admin: "Admin" },
    roles: { STUDENT: "Student", INSTRUCTOR: "Teacher", ADMIN: "Administrator" },
    home: "Home",
    myCourses: "My courses",
    browse: "Browse courses",
    lessons: "Lessons",
    assignments: "Assignments",
    students: "Students",
    assistant: "ERA Assistant",
    contentTools: "Content tools",
    courseEditor: "Course editor",
    lessonEditor: "Lesson editor",
    materials: "Materials",
    knowledge: "Knowledge base",
    account: "Account",
    settings: "Settings",
    overview: "Overview",
    people: "People",
    users: "Users",
    teachers: "Teacher profiles",
    content: "Content",
    courses: "Courses",
    subjects: "Subjects",
    categories: "Categories",
    insights: "Insights",
    analytics: "Analytics",
    progress: "Progress",
    adminAssistant: "Admin Assistant",
    viewSite: "View site",
    signOut: "Sign out",
    toTeacher: "Open Teacher Workspace",
    toAdmin: "Open Admin Workspace"
  },
  uz: {
    workspace: { student: "O'quvchi", teacher: "O'qituvchi", admin: "Admin" },
    roles: { STUDENT: "O'quvchi", INSTRUCTOR: "O'qituvchi", ADMIN: "Administrator" },
    home: "Bosh sahifa",
    myCourses: "Kurslarim",
    browse: "Kurslarni ko'rish",
    lessons: "Darslar",
    assignments: "Topshiriqlar",
    students: "O'quvchilar",
    assistant: "ERA Assistant",
    contentTools: "Kontent vositalari",
    courseEditor: "Kurs muharriri",
    lessonEditor: "Dars muharriri",
    materials: "Materiallar",
    knowledge: "Bilimlar bazasi",
    account: "Hisob",
    settings: "Sozlamalar",
    overview: "Umumiy ko'rinish",
    people: "Foydalanuvchilar",
    users: "Foydalanuvchilar",
    teachers: "O'qituvchi profillari",
    content: "Kontent",
    courses: "Kurslar",
    subjects: "Fanlar",
    categories: "Kategoriyalar",
    insights: "Tahlil",
    analytics: "Analitika",
    progress: "Natijalar",
    adminAssistant: "Admin yordamchisi",
    viewSite: "Saytni ko'rish",
    signOut: "Chiqish",
    toTeacher: "O'qituvchi ish maydoni",
    toAdmin: "Admin ish maydoni"
  }
};

function buildNav(workspace: WorkspaceKind, locale: Locale): { nav: NavGroup[]; tabs?: NavItem[]; home: string } {
  const t = copy[locale];

  if (workspace === "student") {
    const items: NavItem[] = [
      { href: "/learn", label: t.home, icon: <Home />, matchNested: false },
      { href: "/learn/courses", label: t.myCourses, icon: <BookOpen /> },
      { href: "/courses", label: t.browse, icon: <Compass /> }
    ];
    return { home: "/learn", nav: [{ items }], tabs: items };
  }

  if (workspace === "teacher") {
    const main: NavItem[] = [
      { href: "/teacher", label: t.home, icon: <Home />, matchNested: false },
      { href: "/teacher/courses", label: t.myCourses, icon: <BookOpen /> },
      { href: "/teacher/lessons", label: t.lessons, icon: <BookOpenCheck /> },
      { href: "/teacher/knowledge", label: t.knowledge, icon: <Library /> },
      { href: "/teacher/assignments", label: t.assignments, icon: <ClipboardCheck /> },
      { href: "/teacher/students", label: t.students, icon: <Users /> },
      { href: "/teacher/assistant", label: t.assistant, icon: <Sparkles /> }
    ];
    return {
      home: "/teacher",
      nav: [
        { items: main },
        {
          label: t.contentTools,
          items: [
            { href: "/admin/courses", label: t.courseEditor, icon: <FileStack /> },
            { href: "/admin/lessons", label: t.lessonEditor, icon: <FileStack /> },
            { href: "/admin/materials", label: t.materials, icon: <FolderTree /> }
          ]
        },
        { label: t.account, items: [{ href: "/admin/settings", label: t.settings, icon: <Settings /> }] }
      ],
      tabs: [main[0], main[1], main[2], main[4], main[5]]
    };
  }

  return {
    home: "/admin",
    nav: [
      { items: [{ href: "/admin", label: t.overview, icon: <LayoutDashboard />, matchNested: false }] },
      {
        label: t.people,
        items: [
          { href: "/admin/users", label: t.users, icon: <Users /> },
          { href: "/admin/instructors", label: t.teachers, icon: <GraduationCap /> }
        ]
      },
      {
        label: t.content,
        items: [
          { href: "/admin/courses", label: t.courses, icon: <BookOpen /> },
          { href: "/admin/lessons", label: t.lessons, icon: <BookOpenCheck /> },
          { href: "/admin/materials", label: t.materials, icon: <FolderTree /> },
          { href: "/admin/knowledge", label: t.knowledge, icon: <Library /> },
          { href: "/admin/subjects", label: t.subjects, icon: <Tags /> },
          { href: "/admin/categories", label: t.categories, icon: <Tags /> }
        ]
      },
      {
        label: t.insights,
        items: [
          { href: "/admin/analytics", label: t.analytics, icon: <BarChart3 /> },
          { href: "/admin/progress", label: t.progress, icon: <LineChart /> },
          { href: "/admin/assistant", label: t.adminAssistant, icon: <Sparkles /> }
        ]
      },
      { label: t.account, items: [{ href: "/admin/settings", label: t.settings, icon: <Settings /> }] }
    ]
  };
}

type WorkspaceShellProps = {
  workspace: WorkspaceKind;
  children: React.ReactNode;
  assistant?: React.ReactNode;
};

/** Server wrapper around AppShell: picks the role's navigation and builds the top bar. */
export async function WorkspaceShell({ workspace, children, assistant }: WorkspaceShellProps) {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const t = copy[locale];
  const messages = getMessages(locale);
  const { nav, tabs, home } = buildNav(workspace, locale);
  const role = (user?.role ?? "STUDENT") as keyof typeof t.roles;

  // Only admins have a second workspace. Teacher data stays scoped to their own instructor profile.
  const switchTo =
    user?.role === "ADMIN"
      ? workspace === "admin"
        ? { href: "/teacher", label: t.toTeacher }
        : { href: "/admin", label: t.toAdmin }
      : undefined;

  return (
    <AppShell
      workspaceLabel={t.workspace[workspace]}
      homeHref={home}
      nav={nav}
      mobileTabs={tabs}
      assistant={assistant}
      topBarActions={
        <>
          <LanguageSwitcher
            locale={locale}
            label={messages.language.short}
            englishLabel={messages.language.english}
            uzbekLabel={messages.language.uzbek}
            compact
          />
          {user ? (
            <AccountMenu
              name={user.name}
              roleLabel={t.roles[role] ?? user.role}
              settingsHref={workspace === "student" ? undefined : "/admin/settings"}
              switchTo={switchTo}
              labels={{ viewSite: t.viewSite, settings: t.settings, signOut: t.signOut, account: t.account }}
              signOutAction={signOutAction}
            />
          ) : null}
        </>
      }
    >
      {children}
    </AppShell>
  );
}
