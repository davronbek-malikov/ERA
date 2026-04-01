import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type CurrentUser = {
  id: string;
  email: string;
  role: string;
};

export function canAccessAdminStudio(role?: string | null) {
  return role === UserRole.ADMIN || role === UserRole.INSTRUCTOR;
}

export function isAdmin(role?: string | null) {
  return role === UserRole.ADMIN;
}

export async function getInstructorRecordForUser(user: CurrentUser) {
  if (user.role !== UserRole.INSTRUCTOR) {
    return null;
  }

  const instructor = await prisma.instructor.findFirst({
    where: {
      OR: [{ userId: user.id }, { email: user.email }]
    },
    select: {
      id: true,
      name: true,
      userId: true,
      email: true
    }
  });

  if (!instructor) {
    return null;
  }

  if (!instructor.userId) {
    await prisma.instructor.update({
      where: { id: instructor.id },
      data: { userId: user.id }
    });
  }

  return {
    ...instructor,
    userId: instructor.userId ?? user.id
  };
}

export async function assertCourseManagementAccess(courseId: string, user: CurrentUser) {
  if (user.role === UserRole.ADMIN) {
    return {
      allowed: true as const,
      course: await prisma.course.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          slug: true,
          instructorId: true
        }
      })
    };
  }

  const instructor = await getInstructorRecordForUser(user);
  if (!instructor) {
    return {
      allowed: false as const,
      course: null
    };
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      slug: true,
      instructorId: true
    }
  });

  if (!course || course.instructorId !== instructor.id) {
    return {
      allowed: false as const,
      course
    };
  }

  return {
    allowed: true as const,
    course
  };
}
