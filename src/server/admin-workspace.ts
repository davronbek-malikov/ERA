import { Prisma, PublicationStatus, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";

/*
 * Admin Workspace data. Only call these from pages guarded by requireAdmin (src/server/workspace.ts).
 * Admins see account fields and aggregates, never conversation content
 * (docs/ERA_INFORMATION_ARCHITECTURE.md §2.4).
 */

export async function getAdminOverview() {
  return retryOnDatabaseFailure(async () => {
    const [students, teachers, admins, publishedCourses, totalCourses, enrollments, completedEnrollments, activity] = await Promise.all([
      prisma.user.count({ where: { role: UserRole.STUDENT } }),
      prisma.user.count({ where: { role: UserRole.INSTRUCTOR } }),
      prisma.user.count({ where: { role: UserRole.ADMIN } }),
      prisma.course.count({ where: { status: PublicationStatus.PUBLISHED } }),
      prisma.course.count(),
      prisma.enrollment.count(),
      prisma.enrollment.count({ where: { progress: { gte: 100 } } }),
      prisma.activityLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, type: true, message: true, createdAt: true, user: { select: { name: true } } }
      })
    ]);

    return {
      students,
      teachers,
      admins,
      publishedCourses,
      totalCourses,
      enrollments,
      completionRate: enrollments === 0 ? null : Math.round((completedEnrollments / enrollments) * 100),
      activity
    };
  });
}

export type AdminUserFilters = { q?: string; role?: string; status?: string };

export async function getAdminUserList(filters: AdminUserFilters) {
  const role = Object.values(UserRole).find((value) => value === filters.role);
  const q = filters.q?.trim();
  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } }
          ]
        }
      : {})
  };

  return retryOnDatabaseFailure(async () => {
    const [users, counts] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
        // Account fields only: no password hash, no learning data.
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
          _count: { select: { enrollments: true } }
        }
      }),
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } })
    ]);

    const countFor = (value: UserRole) => counts.find((row) => row.role === value)?._count._all ?? 0;
    return {
      users,
      counts: {
        all: counts.reduce((sum, row) => sum + row._count._all, 0),
        STUDENT: countFor(UserRole.STUDENT),
        INSTRUCTOR: countFor(UserRole.INSTRUCTOR),
        ADMIN: countFor(UserRole.ADMIN)
      }
    };
  });
}

function weekStart(date: Date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = (day.getUTCDay() + 6) % 7; // Monday
  day.setUTCDate(day.getUTCDate() - offset);
  return day;
}

function bucket<T>(rows: T[], getDate: (row: T) => Date, keys: Date[], keyOf: (date: Date) => Date) {
  const counts = new Map(keys.map((key) => [key.getTime(), 0]));
  for (const row of rows) {
    const key = keyOf(getDate(row)).getTime();
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return keys.map((key) => ({ date: key, value: counts.get(key.getTime()) ?? 0 }));
}

export async function getAdminAnalytics() {
  const now = new Date();
  const thisWeek = weekStart(now);
  const weeks = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(thisWeek);
    date.setUTCDate(date.getUTCDate() - (11 - index) * 7);
    return date;
  });
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - (29 - index));
    return date;
  });
  const dayOf = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  return retryOnDatabaseFailure(async () => {
    const [enrollments, courses, activity, questions] = await Promise.all([
      prisma.enrollment.findMany({ where: { createdAt: { gte: weeks[0] } }, select: { createdAt: true } }),
      prisma.course.findMany({
        where: { status: PublicationStatus.PUBLISHED },
        select: { title: true, enrollments: { select: { progress: true } } }
      }),
      prisma.activityLog.findMany({ where: { createdAt: { gte: days[0] } }, select: { createdAt: true } }),
      // Tutor questions asked by students: counted from stored chat messages. Content is never read here.
      prisma.chatMessage.findMany({ where: { role: "USER", createdAt: { gte: days[0] } }, select: { createdAt: true } })
    ]);

    return {
      enrollmentsByWeek: bucket(enrollments, (row) => row.createdAt, weeks, weekStart),
      completionByCourse: courses
        .map((course) => {
          const total = course.enrollments.length;
          const completed = course.enrollments.filter((enrollment) => enrollment.progress >= 100).length;
          const average = total === 0 ? 0 : Math.round(course.enrollments.reduce((sum, enrollment) => sum + enrollment.progress, 0) / total);
          return { title: course.title, total, completed, average };
        })
        .sort((a, b) => b.total - a.total),
      activityByDay: bucket(activity, (row) => row.createdAt, days, dayOf),
      tutorQuestionsByDay: bucket(questions, (row) => row.createdAt, days, dayOf)
    };
  });
}

export async function getAdminCourseStats() {
  return retryOnDatabaseFailure(() =>
    prisma.course.findMany({
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        instructor: { select: { name: true } },
        enrollments: { select: { progress: true } },
        _count: { select: { lessons: true } }
      }
    })
  );
}
