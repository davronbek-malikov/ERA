import { Prisma, PublicationStatus, UserRole } from "@prisma/client";
import { cache } from "react";

import { createApiErrorResponse } from "@/lib/app-errors";
import { getCurrentUser } from "@/lib/auth";
import { getInstructorRecordForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { RateLimitError } from "@/lib/rate-limit";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { RequestError } from "@/lib/validation";
import {
  ENROLLMENT_ACCESS_SELECT,
  evaluateEnrollmentAccess,
  type AccessBlockReason,
  type EnrollmentAccessFields
} from "@/server/management/access";

/**
 * ERA authorization core (Prompt 07, docs/ERA_AUTHORIZATION_MATRIX.md).
 *
 * Every API route, server action and data loader that touches a course, lesson, material, conversation
 * or another user's data decides access here. Rules:
 *  - deny by default: a helper either returns the authorized record or throws `AuthzError`;
 *  - identities come from the session (`getCurrentUser` re-reads the DB), never from the request body;
 *  - a teacher without a linked instructor profile owns nothing (fail closed);
 *  - "not found" and "not yours" look the same (404) wherever the record's existence is itself private.
 */

export type AuthUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export class AuthzError extends RequestError {
  constructor(status: 401 | 403 | 404, code: string, message: string) {
    super(status, code, message);
    this.name = "AuthzError";
  }
}

export const authErrors = {
  unauthenticated: () => new AuthzError(401, "auth-required", "Sign in to continue."),
  forbidden: (message = "You do not have access to this resource.") => new AuthzError(403, "forbidden", message),
  notFound: (message = "Not found.") => new AuthzError(404, "not-found", message),
  notEnrolled: () => new AuthzError(403, "not-enrolled", "Enroll in this course to continue.")
};

const published = PublicationStatus.PUBLISHED;

// ---------------------------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------------------------

export async function requireAuthenticatedUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw authErrors.unauthenticated();
  return user;
}

export function assertRole(user: AuthUser, roles: UserRole[], message?: string) {
  if (!roles.includes(user.role)) throw authErrors.forbidden(message);
}

export async function requireAdminUser() {
  const user = await requireAuthenticatedUser();
  assertRole(user, [UserRole.ADMIN], "Only administrators can do this.");
  return user;
}

/** Instructors, and admins acting in the studio. Ownership is still checked per course. */
export async function requireTeacherUser() {
  const user = await requireAuthenticatedUser();
  assertRole(user, [UserRole.INSTRUCTOR, UserRole.ADMIN], "Only teachers can do this.");
  return user;
}

export async function requireStudentUser() {
  const user = await requireAuthenticatedUser();
  assertRole(user, [UserRole.STUDENT], "Only student accounts can do this.");
  return user;
}

// ---------------------------------------------------------------------------------------------
// Teacher identity and studio scope
// ---------------------------------------------------------------------------------------------

/**
 * The instructor record that represents this user as a teacher. Fails closed:
 * INSTRUCTOR → their own profile (or null); ADMIN → only a profile explicitly linked to their account.
 */
export async function getInstructorIdForUser(user: Pick<AuthUser, "id" | "email" | "role">): Promise<string | null> {
  return instructorIdFor(user.id, user.role, user.email ?? "");
}

/** Cached per request (React `cache()`), keyed by primitive values: layouts, pages and nav share one lookup. */
const instructorIdFor = cache(async function instructorIdFor(id: string, role: UserRole, email: string): Promise<string | null> {
  const user = { id, role, email };
  if (user.role === UserRole.INSTRUCTOR) {
    const instructor = await getInstructorRecordForUser(user);
    return instructor?.id ?? null;
  }
  if (user.role === UserRole.ADMIN) {
    const linked = await retryOnDatabaseFailure(() =>
      prisma.instructor.findUnique({ where: { userId: user.id }, select: { id: true } })
    );
    return linked?.id ?? null;
  }
  return null;
});

export type StudioScope = { kind: "admin" } | { kind: "instructor"; instructorId: string } | { kind: "none" };

/** What the authoring studio (/admin editors) may see and change for this user. */
export async function getStudioScope(user: AuthUser | null): Promise<StudioScope> {
  if (!user) return { kind: "none" };
  if (user.role === UserRole.ADMIN) return { kind: "admin" };
  if (user.role === UserRole.INSTRUCTOR) {
    const instructorId = await getInstructorIdForUser(user);
    return instructorId ? { kind: "instructor", instructorId } : { kind: "none" };
  }
  return { kind: "none" };
}

/** Prisma filter for courses inside a studio scope; `null` means "nothing" (callers return empty). */
export function studioCourseWhere(scope: StudioScope): Prisma.CourseWhereInput | null {
  if (scope.kind === "admin") return {};
  if (scope.kind === "instructor") return { instructorId: scope.instructorId };
  return null;
}

/**
 * Teacher/admin may manage this course. Admins: any existing course. Instructors: only courses whose
 * `instructorId` is their own profile. Missing course and someone else's course are both 404.
 */
export async function requireTeacherCourseOwnership(user: AuthUser, courseId: string) {
  const scope = await getStudioScope(user);
  if (scope.kind === "none") {
    throw authErrors.forbidden("Your account is not linked to a teacher profile.");
  }

  const course = await retryOnDatabaseFailure(() =>
    prisma.course.findUnique({ where: { id: courseId }, select: { id: true, slug: true, instructorId: true } })
  );
  if (!course) throw authErrors.notFound("Course not found.");
  if (scope.kind === "instructor" && course.instructorId !== scope.instructorId) {
    throw authErrors.notFound("Course not found.");
  }
  return { course, scope };
}

// ---------------------------------------------------------------------------------------------
// Learner access (courses, lessons)
// ---------------------------------------------------------------------------------------------

export type CourseAccessMode = "student" | "teacher-preview" | "admin-inspection";

export type CourseAccess =
  | { status: "ok"; mode: CourseAccessMode }
  | { status: "not-enrolled"; courseTitle: string }
  /** Enrolled, but access is restricted, revoked, expired or paused for an overdue payment (Student Management). */
  | { status: "access-blocked"; courseTitle: string; reason: AccessBlockReason; message: string }
  | { status: "not-found" };

type CourseForAccess = { id: string; status: PublicationStatus; instructorId: string; title: string };

/**
 * Who may open a course as a learner:
 *  - STUDENT: course published AND an enrollment exists AND that enrollment currently grants access
 *    (src/server/management/access.ts: status, access status, expiry, overdue rule);
 *  - teacher who owns the course: preview (drafts included);
 *  - ADMIN: inspection.
 * Everyone else: not-found. Pass `enrollment` (or null) when the caller already loaded it (avoids a query).
 */
export async function resolveCourseAccess(
  user: AuthUser,
  course: CourseForAccess,
  enrollment?: EnrollmentAccessFields | null
): Promise<CourseAccess> {
  if (user.role === UserRole.STUDENT) {
    if (course.status !== published) return { status: "not-found" };
    const found =
      enrollment !== undefined
        ? enrollment
        : await retryOnDatabaseFailure(() =>
            prisma.enrollment.findUnique({
              where: { userId_courseId: { userId: user.id, courseId: course.id } },
              select: ENROLLMENT_ACCESS_SELECT
            })
          );
    if (!found) return { status: "not-enrolled", courseTitle: course.title };
    const decision = await evaluateEnrollmentAccess(found);
    return decision.allowed
      ? { status: "ok", mode: "student" }
      : { status: "access-blocked", courseTitle: course.title, reason: decision.reason, message: decision.message };
  }

  const instructorId = await getInstructorIdForUser(user);
  if (instructorId && instructorId === course.instructorId) return { status: "ok", mode: "teacher-preview" };
  if (user.role === UserRole.ADMIN) return { status: "ok", mode: "admin-inspection" };
  return { status: "not-found" };
}

function throwForAccess(access: CourseAccess): never {
  if (access.status === "not-enrolled") throw authErrors.notEnrolled();
  if (access.status === "access-blocked") throw new AuthzError(403, "course-access-blocked", access.message);
  throw authErrors.notFound("Course not found.");
}

export async function requireCourseAccess(user: AuthUser, courseId: string) {
  const course = await retryOnDatabaseFailure(() =>
    prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        instructorId: true,
        enrollments: { where: { userId: user.id }, select: ENROLLMENT_ACCESS_SELECT, take: 1 }
      }
    })
  );
  if (!course) throw authErrors.notFound("Course not found.");

  const access = await resolveCourseAccess(user, course, course.enrollments[0] ?? null);
  if (access.status !== "ok") throwForAccess(access);
  return { course, mode: access.mode };
}

/** A student enrolled in a published course, with access right now. Returns the enrollment. Never creates one. */
export async function requireStudentEnrollment(user: AuthUser, courseId: string) {
  assertRole(user, [UserRole.STUDENT], "Only student accounts can do this.");
  const enrollment = await retryOnDatabaseFailure(() =>
    prisma.enrollment.findFirst({
      where: { userId: user.id, courseId, course: { status: published } },
      select: { ...ENROLLMENT_ACCESS_SELECT, courseId: true, currentLessonId: true }
    })
  );
  if (!enrollment) throw authErrors.notEnrolled();
  const decision = await evaluateEnrollmentAccess(enrollment);
  if (!decision.allowed) throw new AuthzError(403, "course-access-blocked", decision.message);
  return { id: enrollment.id, courseId: enrollment.courseId, currentLessonId: enrollment.currentLessonId };
}

/**
 * Lesson access in one query (lesson → course → this user's enrollment).
 * Students additionally need the lesson itself published. When `courseId` is given, the lesson must
 * belong to that course (prevents mixing a course the user may access with a lesson they may not).
 */
export async function requireLessonAccess(
  user: AuthUser,
  lessonId: string,
  options: { courseId?: string; studentsOnly?: boolean } = {}
) {
  if (options.studentsOnly) assertRole(user, [UserRole.STUDENT], "Only student accounts can do this.");

  const lesson = await retryOnDatabaseFailure(() =>
    prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        courseId: true,
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            status: true,
            instructorId: true,
            enrollments: { where: { userId: user.id }, select: ENROLLMENT_ACCESS_SELECT, take: 1 }
          }
        }
      }
    })
  );

  if (!lesson) throw authErrors.notFound("Lesson not found.");
  if (options.courseId && lesson.courseId !== options.courseId) throw authErrors.notFound("Lesson not found.");

  const access = await resolveCourseAccess(user, lesson.course, lesson.course.enrollments[0] ?? null);
  if (access.status !== "ok") throwForAccess(access);
  if (access.mode === "student" && lesson.status !== published) throw authErrors.notFound("Lesson not found.");

  const { enrollments: _enrollments, ...course } = lesson.course;
  return {
    lesson: { id: lesson.id, slug: lesson.slug, title: lesson.title, status: lesson.status, courseId: lesson.courseId },
    course,
    mode: access.mode
  };
}

// ---------------------------------------------------------------------------------------------
// Request hygiene for route handlers
// ---------------------------------------------------------------------------------------------

/**
 * CSRF defence in depth for cookie-authenticated JSON endpoints (the session cookie is SameSite=Lax).
 * Browsers always send `Origin` on cross-origin and on same-origin POST fetches; when present it must
 * match the host the request was sent to.
 */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }
  if (!host || originHost !== host) {
    throw new AuthzError(403, "cross-origin", "Cross-origin requests are not allowed.");
  }
}

/**
 * Converts any thrown error into a safe API response. Known errors keep their status and fixed
 * message; anything else is logged on the server (name + message only, never request bodies) and the
 * client receives the caller's generic fallback.
 */
export function toApiErrorResponse(
  error: unknown,
  fallback: { status?: number; code: string; message: string; retryable?: boolean; log: string }
) {
  if (error instanceof RequestError) {
    const detail = (error as RequestError & { logDetail?: string }).logDetail;
    if (detail) console.error(`[${fallback.log}] ${error.code}: ${detail}`);
    return createApiErrorResponse(error.status, error.code, error.message, {
      retryable: (error as RequestError & { retryable?: boolean }).retryable ?? false
    });
  }
  if (error instanceof RateLimitError) {
    const response = createApiErrorResponse(
      429,
      "rate-limited",
      `Too many requests. Please wait ${error.retryAfterSeconds} seconds and try again.`,
      { retryable: true }
    );
    response.headers.set("Retry-After", String(error.retryAfterSeconds));
    return response;
  }

  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[${fallback.log}] ${detail}`);
  return createApiErrorResponse(fallback.status ?? 503, fallback.code, fallback.message, {
    retryable: fallback.retryable ?? true
  });
}
