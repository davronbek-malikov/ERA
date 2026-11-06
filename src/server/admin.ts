import { Prisma, PublicationStatus, UserRole } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStudioScope, studioCourseWhere, type StudioScope } from "@/server/authz";

/*
 * Authoring-studio loaders (/admin editors). Every loader is scoped by `getStudioScope` and FAILS CLOSED:
 * admins see everything, instructors only their own courses, and anyone else — including an instructor
 * whose account is not linked to a teacher profile — sees nothing.
 */

async function getStudioContext(): Promise<{ scope: StudioScope; courseWhere: Prisma.CourseWhereInput | null }> {
  const currentUser = await getCurrentUser();
  const scope = await getStudioScope(currentUser);
  return { scope, courseWhere: studioCourseWhere(scope) };
}

async function requireAdminScope() {
  const { scope } = await getStudioContext();
  return scope.kind === "admin";
}

/** Legacy overview numbers. Admin only (the instructor variant leaked platform-wide activity). */
export async function getAdminDashboardData() {
  if (!(await requireAdminScope())) {
    return { totalUsers: 0, totalCourses: 0, totalEnrollments: 0, recentActivity: [] };
  }

  const [totalUsers, totalCourses, totalEnrollments, recentActivity] = await Promise.all([
    prisma.user.count(),
    prisma.course.count(),
    prisma.enrollment.count(),
    prisma.activityLog.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } }
      }
    })
  ]);

  return { totalUsers, totalCourses, totalEnrollments, recentActivity };
}

export async function getAdminSubjects() {
  return prisma.subject.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          categories: true
        }
      }
    }
  });
}

export async function getAdminCategories() {
  return prisma.category.findMany({
    orderBy: [{ subject: { position: "asc" } }, { position: "asc" }, { name: "asc" }],
    include: {
      subject: true,
      _count: {
        select: {
          courses: true
        }
      }
    }
  });
}

export async function getAdminCourses() {
  const { courseWhere } = await getStudioContext();
  if (!courseWhere) return [];

  return prisma.course.findMany({
    where: courseWhere,
    orderBy: [{ updatedAt: "desc" }],
    include: {
      instructor: true,
      category: {
        include: {
          subject: true
        }
      },
      _count: {
        select: {
          lessons: true,
          enrollments: true
        }
      }
    }
  });
}

export async function getAdminLessons() {
  const { courseWhere } = await getStudioContext();
  if (!courseWhere) return [];

  return prisma.lesson.findMany({
    where: { course: courseWhere },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      course: {
        include: {
          category: {
            include: {
              subject: true
            }
          }
        }
      }
    }
  });
}

export async function getAdminInstructors() {
  return prisma.instructor.findMany({
    orderBy: [{ name: "asc" }],
    include: {
      _count: {
        select: {
          courses: true
        }
      }
    }
  });
}

/** Legacy user list. Admin only, and never selects password hashes. */
export async function getAdminUsers() {
  if (!(await requireAdminScope())) return [];

  return prisma.user.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
      _count: {
        select: {
          enrollments: true,
          activities: true
        }
      }
    }
  });
}

export async function getAdminFormOptions() {
  const { scope } = await getStudioContext();

  const [subjects, categories, instructors] = await Promise.all([
    prisma.subject.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true }
    }),
    prisma.category.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: { subject: true }
    }),
    prisma.instructor.findMany({
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true }
    })
  ]);

  return {
    subjects,
    categories,
    // Instructors may only assign courses to themselves; without a profile, to nobody.
    instructors:
      scope.kind === "admin"
        ? instructors
        : scope.kind === "instructor"
          ? instructors.filter((item) => item.id === scope.instructorId)
          : [],
    roles: scope.kind === "admin" ? Object.values(UserRole) : [UserRole.INSTRUCTOR, UserRole.STUDENT],
    statuses: Object.values(PublicationStatus)
  };
}

export async function getAdminMaterials() {
  const { courseWhere } = await getStudioContext();
  if (!courseWhere) return [];

  return prisma.courseMaterial.findMany({
    where: { course: courseWhere },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      course: true,
      lesson: true,
      createdBy: {
        select: {
          name: true
        }
      }
    }
  });
}

export async function getAdminProgressData() {
  const { courseWhere } = await getStudioContext();
  if (!courseWhere) return [];

  return prisma.enrollment.findMany({
    where: { course: courseWhere },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      user: {
        select: {
          name: true,
          email: true
        }
      },
      course: {
        include: {
          instructor: true,
          lessons: {
            where: { status: PublicationStatus.PUBLISHED },
            include: {
              completions: {
                select: {
                  userId: true
                }
              }
            }
          }
        }
      }
    }
  });
}

export async function getSiteSettings() {
  return prisma.siteSetting.findUnique({
    where: { id: "default" }
  });
}

export async function getPublicSiteSettings() {
  return prisma.siteSetting.findUnique({
    where: { id: "default" }
  });
}
