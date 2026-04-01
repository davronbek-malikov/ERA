import { PublicationStatus, UserRole } from "@prisma/client";

import {
  demoActivityLog,
  demoCategories,
  demoCourses,
  demoEnrollments,
  demoInstructors,
  demoLessons,
  demoSubjects,
  demoUsers
} from "@/lib/demo-data";
import { getCurrentUser } from "@/lib/auth";
import { getInstructorRecordForUser, isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { withDatabaseFallback } from "@/lib/server-data";

async function getStudioContext() {
  const currentUser = await getCurrentUser();
  const instructor =
    currentUser && currentUser.role === UserRole.INSTRUCTOR
      ? await getInstructorRecordForUser(currentUser)
      : null;

  return { currentUser, instructor };
}

export async function getAdminDashboardData() {
  const { currentUser, instructor } = await getStudioContext();

  return withDatabaseFallback(
    async () => {
      if (currentUser?.role === UserRole.INSTRUCTOR && instructor) {
        const [totalStudents, totalCourses, totalEnrollments, recentActivity] = await Promise.all([
          prisma.user.count({
            where: {
              enrollments: {
                some: {
                  course: {
                    instructorId: instructor.id
                  }
                }
              }
            }
          }),
          prisma.course.count({
            where: { instructorId: instructor.id }
          }),
          prisma.enrollment.count({
            where: {
              course: {
                instructorId: instructor.id
              }
            }
          }),
          prisma.activityLog.findMany({
            take: 6,
            orderBy: { createdAt: "desc" },
            include: {
              user: true
            }
          })
        ]);

        return {
          totalUsers: totalStudents,
          totalCourses,
          totalEnrollments,
          recentActivity
        };
      }

      const [totalUsers, totalCourses, totalEnrollments, recentActivity] = await Promise.all([
        prisma.user.count(),
        prisma.course.count(),
        prisma.enrollment.count(),
        prisma.activityLog.findMany({
          take: 6,
          orderBy: { createdAt: "desc" },
          include: {
            user: true
          }
        })
      ]);

      return { totalUsers, totalCourses, totalEnrollments, recentActivity };
    },
    () => ({
      totalUsers:
        currentUser?.role === UserRole.INSTRUCTOR
          ? new Set(
              demoEnrollments
                .filter((enrollment) => {
                  const course = demoCourses.find((item) => item.id === enrollment.courseId);
                  return course?.instructorId === instructor?.id;
                })
                .map((enrollment) => enrollment.userId)
            ).size
          : demoUsers.length,
      totalCourses:
        currentUser?.role === UserRole.INSTRUCTOR && instructor
          ? demoCourses.filter((course) => course.instructorId === instructor.id).length
          : demoCourses.length,
      totalEnrollments:
        currentUser?.role === UserRole.INSTRUCTOR && instructor
          ? demoEnrollments.filter((enrollment) => {
              const course = demoCourses.find((item) => item.id === enrollment.courseId);
              return course?.instructorId === instructor.id;
            }).length
          : demoEnrollments.length,
      recentActivity: demoActivityLog.map((activity) => ({
        ...activity,
        user: demoUsers.find((user) => user.id === activity.userId) ?? null
      }))
    }),
    { allowFallback: false, context: "admin-dashboard" }
  );
}

export async function getAdminSubjects() {
  return withDatabaseFallback(
    () =>
      prisma.subject.findMany({
        orderBy: [{ position: "asc" }, { name: "asc" }],
        include: {
          _count: {
            select: {
              categories: true
            }
          }
        }
      }),
    () =>
      demoSubjects.map((subject) => ({
        ...subject,
        _count: {
          categories: demoCategories.filter((category) => category.subjectId === subject.id).length
        }
      })),
    { allowFallback: false, context: "admin-subjects" }
  );
}

export async function getAdminCategories() {
  return withDatabaseFallback(
    () =>
      prisma.category.findMany({
        orderBy: [{ subject: { position: "asc" } }, { position: "asc" }, { name: "asc" }],
        include: {
          subject: true,
          _count: {
            select: {
              courses: true
            }
          }
        }
      }),
    () =>
      demoCategories.map((category) => ({
        ...category,
        subject: demoSubjects.find((subject) => subject.id === category.subjectId)!,
        _count: {
          courses: demoCourses.filter((course) => course.categoryId === category.id).length
        }
      })),
    { allowFallback: false, context: "admin-categories" }
  );
}

export async function getAdminCourses() {
  const { currentUser, instructor } = await getStudioContext();

  return withDatabaseFallback(
    () =>
      prisma.course.findMany({
        where:
          currentUser?.role === UserRole.INSTRUCTOR && instructor
            ? { instructorId: instructor.id }
            : undefined,
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
      }),
    () =>
      demoCourses.map((course) => ({
        ...course,
        instructor: demoInstructors.find((instructor) => instructor.id === course.instructorId)!,
        category: {
          ...demoCategories.find((category) => category.id === course.categoryId)!,
          subject: demoSubjects.find(
            (subject) =>
              subject.id === demoCategories.find((category) => category.id === course.categoryId)!.subjectId
          )!
        },
        _count: {
          lessons: demoLessons.filter((lesson) => lesson.courseId === course.id).length,
          enrollments: demoEnrollments.filter((enrollment) => enrollment.courseId === course.id).length
        }
      })).filter((course) =>
        currentUser?.role === UserRole.INSTRUCTOR && instructor
          ? course.instructorId === instructor.id
          : true
      ),
    { allowFallback: false, context: "admin-courses" }
  );
}

export async function getAdminLessons() {
  const { currentUser, instructor } = await getStudioContext();

  return withDatabaseFallback(
    () =>
      prisma.lesson.findMany({
        where:
          currentUser?.role === UserRole.INSTRUCTOR && instructor
            ? {
                course: {
                  instructorId: instructor.id
                }
              }
            : undefined,
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
      }),
    () =>
      demoLessons.map((lesson) => {
        const course = demoCourses.find((item) => item.id === lesson.courseId)!;
        const category = demoCategories.find((item) => item.id === course.categoryId)!;

        return {
          ...lesson,
          course: {
            ...course,
            category: {
              ...category,
              subject: demoSubjects.find((subject) => subject.id === category.subjectId)!
            }
          }
        };
      }).filter((lesson) =>
        currentUser?.role === UserRole.INSTRUCTOR && instructor
          ? lesson.course.instructorId === instructor.id
          : true
      ),
    { allowFallback: false, context: "admin-lessons" }
  );
}

export async function getAdminInstructors() {
  return withDatabaseFallback(
    () =>
      prisma.instructor.findMany({
        orderBy: [{ name: "asc" }],
        include: {
          _count: {
            select: {
              courses: true
            }
          }
        }
      }),
    () =>
      demoInstructors.map((instructor) => ({
        ...instructor,
        _count: {
          courses: demoCourses.filter((course) => course.instructorId === instructor.id).length
        }
      })),
    { allowFallback: false, context: "admin-instructors" }
  );
}

export async function getAdminUsers() {
  return withDatabaseFallback(
    () =>
      prisma.user.findMany({
        orderBy: [{ createdAt: "desc" }],
        include: {
          _count: {
            select: {
              enrollments: true,
              activities: true
            }
          }
        }
      }),
    () =>
      demoUsers.map((user) => ({
        ...user,
        _count: {
          enrollments: demoEnrollments.filter((enrollment) => enrollment.userId === user.id).length,
          activities: demoActivityLog.filter((activity) => activity.userId === user.id).length
        }
      })),
    { allowFallback: false, context: "admin-users" }
  );
}

export async function getAdminFormOptions() {
  const { currentUser, instructor } = await getStudioContext();

  return withDatabaseFallback(
    async () => {
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
        instructors:
          currentUser?.role === UserRole.INSTRUCTOR && instructor
            ? instructors.filter((item) => item.id === instructor.id)
            : instructors,
        roles: isAdmin(currentUser?.role) ? Object.values(UserRole) : [UserRole.INSTRUCTOR, UserRole.STUDENT],
        statuses: Object.values(PublicationStatus)
      };
    },
    () => ({
      subjects: demoSubjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        slug: subject.slug
      })),
      categories: demoCategories.map((category) => ({
        ...category,
        subject: demoSubjects.find((subject) => subject.id === category.subjectId)!
      })),
      instructors: demoInstructors
        .map((instructorItem) => ({
          id: instructorItem.id,
          name: instructorItem.name
        }))
        .filter((instructorItem) =>
          currentUser?.role === UserRole.INSTRUCTOR && instructor
            ? instructorItem.id === instructor.id
            : true
        ),
      roles: isAdmin(currentUser?.role) ? Object.values(UserRole) : [UserRole.INSTRUCTOR, UserRole.STUDENT],
      statuses: Object.values(PublicationStatus)
    }),
    { allowFallback: false, context: "admin-form-options" }
  );
}

export async function getAdminMaterials() {
  const { currentUser, instructor } = await getStudioContext();

  return withDatabaseFallback(
    () =>
      prisma.courseMaterial.findMany({
        where:
          currentUser?.role === UserRole.INSTRUCTOR && instructor
            ? { course: { instructorId: instructor.id } }
            : undefined,
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
      }),
    () => [],
    { allowFallback: false, context: "admin-materials" }
  );
}

export async function getAdminProgressData() {
  const { currentUser, instructor } = await getStudioContext();

  return withDatabaseFallback(
    () =>
      prisma.enrollment.findMany({
        where:
          currentUser?.role === UserRole.INSTRUCTOR && instructor
            ? {
                course: {
                  instructorId: instructor.id
                }
              }
            : undefined,
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
      }),
    () =>
      demoEnrollments
        .map((enrollment) => ({
          ...enrollment,
          user: demoUsers.find((user) => user.id === enrollment.userId)!,
          course: {
            ...demoCourses.find((course) => course.id === enrollment.courseId)!,
            instructor: demoInstructors.find(
              (instructorItem) =>
                instructorItem.id ===
                demoCourses.find((course) => course.id === enrollment.courseId)!.instructorId
            )!,
            lessons: demoLessons
              .filter((lesson) => lesson.courseId === enrollment.courseId)
              .map((lesson) => ({
                ...lesson,
                completions: []
              }))
          }
        }))
        .filter((enrollment) =>
          currentUser?.role === UserRole.INSTRUCTOR && instructor
            ? enrollment.course.instructorId === instructor.id
            : true
      ),
    { allowFallback: false, context: "admin-progress" }
  );
}

export async function getSiteSettings() {
  return withDatabaseFallback(
    () =>
      prisma.siteSetting.findUnique({
        where: { id: "default" }
      }),
    () => null,
    { allowFallback: false, context: "site-settings" }
  );
}
