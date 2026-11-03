import { PublicationStatus, UserRole } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { getInstructorRecordForUser, isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";


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
  const { currentUser, instructor } = await getStudioContext();

  return prisma.course.findMany({
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
  });
}

export async function getAdminLessons() {
  const { currentUser, instructor } = await getStudioContext();

  return prisma.lesson.findMany({
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

export async function getAdminUsers() {
  return prisma.user.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
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
  const { currentUser, instructor } = await getStudioContext();

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
}

export async function getAdminMaterials() {
  const { currentUser, instructor } = await getStudioContext();

  return prisma.courseMaterial.findMany({
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
  });
}

export async function getAdminProgressData() {
  const { currentUser, instructor } = await getStudioContext();

  return prisma.enrollment.findMany({
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
