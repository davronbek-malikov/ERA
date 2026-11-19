import { randomInt, randomUUID } from "node:crypto";

import { Prisma, UserRole, type HomeworkStatus, type ManagementSource } from "@prisma/client";

import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { slugify } from "@/lib/slugs";
import { PLACEHOLDER_EMAIL_DOMAIN } from "@/lib/student-contact";
import { invalid, isSafeHttpUrl, optionalId, requireId, requireString, RequestError } from "@/lib/validation";
import { authErrors } from "@/server/authz";
import { assertCan, courseScope, enrollmentScope, requireStudentInScope, type ManagementActor } from "@/server/management/actor";
import { writeAudit } from "@/server/management/audit";
import { conflict, createEnrollment } from "@/server/management/enrollments";
import { parseCreateEnrollment } from "@/server/management/inputs";
import { todayInPlatform } from "@/server/management/time";

/*
 * Teaching workflow (docs/ERA_TEACHER_HOMEWORK.md): a teacher builds a course as a list of lessons ("what I
 * taught" + "the homework"), adds students, and checks each student's homework lesson by lesson against their
 * GitHub work. The same functions serve the forms, the API and the ERA Assistant's confirmed actions.
 */

type Options = { source: ManagementSource };

export const HOMEWORK_STATUSES: HomeworkStatus[] = ["NOT_SUBMITTED", "SUBMITTED", "NEEDS_WORK", "DONE"];

export const HOMEWORK_LABEL: Record<HomeworkStatus, string> = {
  NOT_SUBMITTED: "Not submitted",
  SUBMITTED: "Submitted — to check",
  NEEDS_WORK: "Needs work",
  DONE: "Done correctly"
};

// ------------------------------------------------------------------------------------------------
// Input parsing
// ------------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return null;
  return requireString(value, field, { max });
}

export function parseGithubUrl(value: unknown): string | null {
  const text = optionalText(value, "GitHub link", 300);
  if (!text) return null;
  const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  if (!isSafeHttpUrl(url)) throw invalid("invalid-githubUrl", "The GitHub link must be a web address, e.g. https://github.com/username/repo.");
  return url;
}

export type LessonInput = { title: string; taughtSummary: string | null; homework: string | null };

function parseLesson(raw: unknown, index: number): LessonInput {
  if (typeof raw === "string") return { title: requireString(raw, `lesson ${index + 1} title`, { max: 160 }), taughtSummary: null, homework: null };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalid("invalid-lesson", `Lesson ${index + 1} is not valid.`);
  const value = raw as Raw;
  return {
    title: requireString(value.title, `lesson ${index + 1} title`, { max: 160 }),
    taughtSummary: optionalText(value.taughtSummary, "what was taught", 6000),
    homework: optionalText(value.homework, "homework", 6000)
  };
}

export type CourseInput = { title: string; description: string | null; durationWeeks: number | null; instructorId?: string; lessons: LessonInput[] };

export function parseCourse(raw: Raw): CourseInput {
  const lessonsRaw = Array.isArray(raw.lessons) ? raw.lessons : [];
  const count = raw.lessonCount === undefined || raw.lessonCount === "" ? 0 : Number(raw.lessonCount);
  if (!Number.isInteger(count) || count < 0 || count > 60) throw invalid("invalid-lessonCount", "Number of lessons must be between 0 and 60.");
  const lessons = lessonsRaw.length ? lessonsRaw.map(parseLesson) : Array.from({ length: count }, (_, i) => ({ title: `Lesson ${i + 1}`, taughtSummary: null, homework: null }));
  if (lessons.length > 60) throw invalid("too-many-lessons", "A course can have at most 60 lessons.");
  const weeks = raw.durationWeeks === undefined || raw.durationWeeks === null || raw.durationWeeks === "" ? null : Number(raw.durationWeeks);
  if (weeks !== null && (!Number.isInteger(weeks) || weeks < 1 || weeks > 104)) throw invalid("invalid-durationWeeks", "Duration must be 1–104 weeks.");
  return {
    title: requireString(raw.title, "course title", { min: 2, max: 160 }),
    description: optionalText(raw.description, "description", 4000),
    durationWeeks: weeks,
    instructorId: optionalId(raw.instructorId, "instructorId"),
    lessons
  };
}

export function parseLessonUpdate(raw: Raw): Partial<LessonInput> & { position?: number } {
  const out: Partial<LessonInput> & { position?: number } = {};
  if (raw.title !== undefined) out.title = requireString(raw.title, "lesson title", { max: 160 });
  if (raw.taughtSummary !== undefined) out.taughtSummary = optionalText(raw.taughtSummary, "what was taught", 6000);
  if (raw.homework !== undefined) out.homework = optionalText(raw.homework, "homework", 6000);
  if (!Object.keys(out).length) throw invalid("nothing-to-change", "Nothing to change.");
  return out;
}

export type HomeworkReviewInput = { enrollmentId: string; lessonId: string; status: HomeworkStatus; githubUrl: string | null | undefined; note: string | null | undefined };

export function parseHomeworkReview(raw: Raw): HomeworkReviewInput {
  const status = String(raw.status ?? "");
  if (!HOMEWORK_STATUSES.includes(status as HomeworkStatus)) throw invalid("invalid-status", `status must be one of: ${HOMEWORK_STATUSES.join(", ")}.`);
  return {
    enrollmentId: requireId(raw.enrollmentId, "enrollmentId"),
    lessonId: requireId(raw.lessonId, "lessonId"),
    status: status as HomeworkStatus,
    githubUrl: raw.githubUrl === undefined ? undefined : parseGithubUrl(raw.githubUrl),
    note: raw.note === undefined ? undefined : optionalText(raw.note, "note", 4000)
  };
}

/** "@name", "name", "t.me/name", "https://t.me/name" → "@name"; phone numbers are kept as digits with "+". */
export function parseTelegram(value: unknown): string | null {
  const text = optionalText(value, "Telegram", 80);
  if (!text) return null;
  const link = /^(?:https?:\/\/)?(?:www\.)?t(?:elegram)?\.me\/([A-Za-z0-9_]{4,32})\/?$/i.exec(text);
  if (link) return `@${link[1]}`;
  if (/^@?[A-Za-z][A-Za-z0-9_]{3,31}$/.test(text)) return text.startsWith("@") ? text : `@${text}`;
  const digits = text.replace(/[\s().-]/g, "");
  if (/^\+?\d{7,15}$/.test(digits)) return digits;
  throw invalid("invalid-telegram", "Enter a Telegram username (e.g. @alikarimov) or a phone number.");
}

export type NewStudentInput = {
  name: string;
  email: string | null;
  telegram: string | null;
  githubUrl: string | null;
  password: string | null;
  enrollment: Raw | null;
};

export function parseNewStudent(raw: Raw): NewStudentInput {
  const emailRaw = optionalText(raw.email, "email", 200)?.toLowerCase() ?? null;
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) throw invalid("invalid-email", "Enter a valid email address.");
  const password = optionalText(raw.password, "password", 200);
  if (password && password.length < 8) throw invalid("invalid-password", "The password must be at least 8 characters.");
  const enrollment = raw.courseId ? { ...raw, studentId: "pending" } : null;
  return {
    name: requireString(raw.name, "name", { min: 2, max: 120 }),
    email: emailRaw,
    telegram: parseTelegram(raw.telegram),
    githubUrl: parseGithubUrl(raw.githubUrl),
    password,
    enrollment
  };
}

// ------------------------------------------------------------------------------------------------
// Students
// ------------------------------------------------------------------------------------------------

/** Readable temporary password, e.g. "Era-k7m2-x9q4". Shown once to the teacher; the student should change it. */
function temporaryPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const part = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `Era-${part()}-${part()}`;
}

export async function checkNewStudent(actor: ManagementActor, input: NewStudentInput) {
  assertCan(actor, "manageEnrollments");
  if (input.email) {
    const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existing) throw conflict("account-exists", `An account with ${input.email} already exists. Enroll that student instead.`);
  }
  if (input.enrollment) parseCreateEnrollment(input.enrollment, todayInPlatform());
}

export async function createStudent(actor: ManagementActor, input: NewStudentInput, options: Options) {
  await checkNewStudent(actor, input);
  // No email → an internal address (never shown) and a random password: the teacher tracks this student, and the
  // student doesn't sign in. With an email, a temporary password is returned once so the student can sign in.
  const email = input.email ?? `student-${randomUUID().replace(/-/g, "").slice(0, 16)}@${PLACEHOLDER_EMAIL_DOMAIN}`;
  const password = input.password ?? temporaryPassword();
  let student: { id: string; name: string; email: string };
  try {
    student = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          email,
          telegram: input.telegram,
          githubUrl: input.githubUrl,
          passwordHash: await hashPassword(password),
          role: UserRole.STUDENT,
          status: "ACTIVE"
        },
        select: { id: true, name: true, email: true }
      });
      await writeAudit(tx, {
        actorId: actor.user.id,
        action: "student.create",
        entityType: "student",
        entityId: created.id,
        after: { ...created, telegram: input.telegram, githubUrl: input.githubUrl },
        source: options.source
      });
      await tx.activityLog.create({ data: { type: "USER_CREATED", message: `${created.name} added by ${actor.user.name}`, userId: actor.user.id, context: { studentId: created.id, source: options.source } } });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict("account-exists", "An account with this email already exists.");
    throw error;
  }

  let enrollment: Awaited<ReturnType<typeof createEnrollment>> | null = null;
  if (input.enrollment) {
    enrollment = await createEnrollment(actor, parseCreateEnrollment({ ...input.enrollment, studentId: student.id }, todayInPlatform()), options);
  }
  return { student, temporaryPassword: input.email && !input.password ? password : null, enrollment };
}

export type ContactInput = { githubUrl?: string | null; telegram?: string | null };

export function parseContact(raw: Raw): ContactInput {
  const out: ContactInput = {};
  if (raw.githubUrl !== undefined) out.githubUrl = parseGithubUrl(raw.githubUrl);
  if (raw.telegram !== undefined) out.telegram = parseTelegram(raw.telegram);
  if (!Object.keys(out).length) throw invalid("nothing-to-change", "Nothing to change.");
  return out;
}

/** GitHub link and Telegram of a student the actor teaches (or any student, for admins). */
export async function updateStudentContact(actor: ManagementActor, studentId: string, input: ContactInput, options: Options) {
  assertCan(actor, "teaching");
  const student = await requireStudentInScope(actor, studentId);
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: student.id }, select: { githubUrl: true, telegram: true } });
    const after = await tx.user.update({ where: { id: student.id }, data: input, select: { githubUrl: true, telegram: true } });
    await writeAudit(tx, { actorId: actor.user.id, action: "student.contact", entityType: "student", entityId: student.id, before, after, source: options.source });
    return { studentId: student.id, ...after };
  });
}

// ------------------------------------------------------------------------------------------------
// Courses and lessons
// ------------------------------------------------------------------------------------------------

async function uniqueCourseSlug(db: Prisma.TransactionClient, title: string) {
  const base = slugify(title) || "course";
  for (let suffix = 1; suffix < 200; suffix += 1) {
    const slug = suffix === 1 ? base : `${base}-${suffix}`;
    if (!(await db.course.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${Date.now()}`;
}

function lessonSlug(title: string, position: number) {
  return `${String(position).padStart(2, "0")}-${slugify(title) || "lesson"}`.slice(0, 80);
}

/** A category for teacher-created courses: the first existing one, or "General" created on demand. */
async function defaultCategoryId(db: Prisma.TransactionClient) {
  const existing = await db.category.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (existing) return existing.id;
  const subject = (await db.subject.findFirst({ select: { id: true } })) ?? (await db.subject.create({ data: { name: "General", slug: "general" } }));
  return (await db.category.create({ data: { name: "General", slug: "general", subjectId: subject.id }, select: { id: true } })).id;
}

export async function checkCourse(actor: ManagementActor, input: CourseInput) {
  assertCan(actor, "teaching");
  const instructorId = actor.kind === "teacher" ? actor.instructorId : (input.instructorId ?? actor.instructorId);
  if (!instructorId) throw new RequestError(400, "teacher-required", "Choose the teacher of this course.");
  if (actor.kind === "teacher" && input.instructorId && input.instructorId !== actor.instructorId) throw authErrors.forbidden("Teachers create courses for themselves.");
  const instructor = await prisma.instructor.findUnique({ where: { id: instructorId }, select: { id: true, name: true } });
  if (!instructor) throw authErrors.notFound("Teacher not found.");
  return { instructor };
}

export async function createCourseWithLessons(actor: ManagementActor, input: CourseInput, options: Options) {
  const { instructor } = await checkCourse(actor, input);
  return prisma.$transaction(async (tx) => {
    // New courses go to the end of this teacher's list.
    const last = await tx.course.findFirst({ where: { instructorId: instructor.id }, orderBy: { position: "desc" }, select: { position: true } });
    const course = await tx.course.create({
      data: {
        position: (last?.position ?? 0) + 1,
        title: input.title,
        slug: await uniqueCourseSlug(tx, input.title),
        shortDescription: input.description?.slice(0, 280) ?? null,
        description: input.description,
        instructorId: instructor.id,
        categoryId: await defaultCategoryId(tx),
        outcomes: [],
        status: "PUBLISHED",
        lessons: {
          create: input.lessons.map((lesson, index) => ({
            title: lesson.title,
            slug: lessonSlug(lesson.title, index + 1),
            position: index + 1,
            status: "PUBLISHED" as const,
            taughtSummary: lesson.taughtSummary,
            homework: lesson.homework
          }))
        }
      },
      select: { id: true, title: true, slug: true }
    });
    await writeAudit(tx, {
      actorId: actor.user.id,
      action: "course.create",
      entityType: "course",
      entityId: course.id,
      after: { ...course, instructorId: instructor.id, durationWeeks: input.durationWeeks, lessons: input.lessons.length },
      source: options.source
    });
    await tx.activityLog.create({ data: { type: "COURSE_CREATED", message: `${course.title} created by ${actor.user.name}`, userId: actor.user.id, context: { courseId: course.id } } });
    return { courseId: course.id, title: course.title, lessons: input.lessons.length, teacher: instructor.name };
  });
}

async function courseInScope(actor: ManagementActor, courseId: string) {
  const course = await prisma.course.findFirst({ where: { id: courseId, ...courseScope(actor) }, select: { id: true, title: true } });
  if (!course) throw authErrors.notFound("Course not found.");
  return course;
}

export async function addLesson(actor: ManagementActor, courseId: string, input: LessonInput, options: Options) {
  assertCan(actor, "teaching");
  const course = await courseInScope(actor, courseId);
  return prisma.$transaction(async (tx) => {
    const last = await tx.lesson.findFirst({ where: { courseId: course.id }, orderBy: { position: "desc" }, select: { position: true } });
    const position = (last?.position ?? 0) + 1;
    let slug = lessonSlug(input.title, position);
    if (await tx.lesson.findFirst({ where: { courseId: course.id, slug }, select: { id: true } })) slug = `${slug}-${Date.now()}`;
    const lesson = await tx.lesson.create({
      data: { courseId: course.id, title: input.title, slug, position, status: "PUBLISHED", taughtSummary: input.taughtSummary, homework: input.homework },
      select: { id: true, title: true, position: true }
    });
    await writeAudit(tx, { actorId: actor.user.id, action: "lesson.create", entityType: "lesson", entityId: lesson.id, after: { ...lesson, courseId: course.id, ...input }, source: options.source });
    return { lessonId: lesson.id, position: lesson.position, courseTitle: course.title, title: lesson.title };
  });
}

export async function checkLessonUpdate(actor: ManagementActor, lessonId: string) {
  assertCan(actor, "teaching");
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, course: courseScope(actor) },
    select: { id: true, title: true, position: true, taughtSummary: true, homework: true, course: { select: { title: true } } }
  });
  if (!lesson) throw authErrors.notFound("Lesson not found.");
  return lesson;
}

export async function updateLesson(actor: ManagementActor, lessonId: string, input: Partial<LessonInput>, options: Options) {
  const lesson = await checkLessonUpdate(actor, lessonId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.lesson.update({ where: { id: lesson.id }, data: input, select: { id: true, title: true, position: true, taughtSummary: true, homework: true } });
    const { course: _course, ...before } = lesson;
    await writeAudit(tx, { actorId: actor.user.id, action: "lesson.update", entityType: "lesson", entityId: lesson.id, before, after: updated, source: options.source });
    return { lessonId: lesson.id, position: lesson.position, courseTitle: lesson.course.title, title: updated.title };
  });
}

// ------------------------------------------------------------------------------------------------
// Homework reviews
// ------------------------------------------------------------------------------------------------

export async function checkHomeworkReview(actor: ManagementActor, input: HomeworkReviewInput) {
  assertCan(actor, "teaching");
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: input.enrollmentId, ...enrollmentScope(actor) },
    select: { id: true, courseId: true, user: { select: { name: true } }, course: { select: { title: true } } }
  });
  if (!enrollment) throw authErrors.notFound("Enrollment not found.");
  const lesson = await prisma.lesson.findFirst({ where: { id: input.lessonId, courseId: enrollment.courseId }, select: { id: true, title: true, position: true } });
  if (!lesson) throw authErrors.notFound("That lesson isn't part of this student's course.");
  const current = await prisma.homeworkReview.findUnique({ where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: lesson.id } } });
  return { enrollment, lesson, current };
}

export async function reviewHomework(actor: ManagementActor, input: HomeworkReviewInput, options: Options) {
  const { enrollment, lesson, current } = await checkHomeworkReview(actor, input);
  const checked = input.status === "DONE" || input.status === "NEEDS_WORK";
  return prisma.$transaction(async (tx) => {
    const data = {
      status: input.status,
      ...(input.githubUrl !== undefined ? { githubUrl: input.githubUrl } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      checkedAt: checked ? new Date() : null,
      checkedById: checked ? actor.user.id : null,
      // First hand-in date drives the weekly rule; going back to "not submitted" clears it.
      submittedAt: input.status === "NOT_SUBMITTED" ? null : (current?.submittedAt ?? new Date())
    };
    const review = await tx.homeworkReview.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: lesson.id } },
      create: { enrollmentId: enrollment.id, lessonId: lesson.id, ...data },
      update: data
    });
    await writeAudit(tx, { actorId: actor.user.id, action: "homework.review", entityType: "homework", entityId: review.id, before: current, after: review, source: options.source });
    return { reviewId: review.id, student: enrollment.user.name, course: enrollment.course.title, lesson: `${lesson.position}. ${lesson.title}`, status: review.status };
  });
}

// ------------------------------------------------------------------------------------------------
// Reads
// ------------------------------------------------------------------------------------------------

/** The actor's courses with their lessons (what was taught + homework), for the course page and the AI. */
export async function listTeachingCourses(actor: ManagementActor) {
  const courses = await retryOnDatabaseFailure(() =>
    prisma.course.findMany({
      where: courseScope(actor),
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        status: true,
        instructor: { select: { name: true } },
        lessons: { orderBy: { position: "asc" }, select: { id: true, title: true, position: true, taughtSummary: true, homework: true } },
        _count: { select: { enrollments: { where: { status: "ACTIVE", ...enrollmentScope(actor) } } } }
      }
    })
  );
  return courses.map((course) => ({ ...course, activeStudents: course._count.enrollments }));
}

/** Homework table for one enrollment: every lesson of the course with this student's review. */
export async function getEnrollmentHomework(enrollmentId: string, courseId: string) {
  const [lessons, reviews] = await Promise.all([
    prisma.lesson.findMany({ where: { courseId }, orderBy: { position: "asc" }, select: { id: true, title: true, position: true, taughtSummary: true, homework: true } }),
    prisma.homeworkReview.findMany({ where: { enrollmentId }, include: { checkedBy: { select: { name: true } } } })
  ]);
  const byLesson = new Map(reviews.map((review) => [review.lessonId, review]));
  return lessons.map((lesson) => {
    const review = byLesson.get(lesson.id);
    return {
      ...lesson,
      review: review
        ? {
            id: review.id,
            status: review.status,
            githubUrl: review.githubUrl,
            note: review.note,
            checkedAt: review.checkedAt?.toISOString() ?? null,
            submittedAt: review.submittedAt?.toISOString() ?? null,
            checkedBy: review.checkedBy?.name ?? null
          }
        : null
    };
  });
}

// ------------------------------------------------------------------------------------------------
// Course order
// ------------------------------------------------------------------------------------------------

export function parseCourseOrder(raw: Raw): string[] {
  const ids = Array.isArray(raw.courseIds) ? raw.courseIds : [];
  if (!ids.length || ids.length > 200) throw invalid("invalid-courseIds", "Send the courses in their new order.");
  const parsed = ids.map((id) => requireId(id, "courseId"));
  if (new Set(parsed).size !== parsed.length) throw invalid("duplicate-courseIds", "A course appears twice.");
  return parsed;
}

/** Saves the teacher's own course order (positions 1..n). Every course must be in the actor's scope. */
export async function reorderCourses(actor: ManagementActor, courseIds: string[], options: Options) {
  assertCan(actor, "teaching");
  return prisma.$transaction(async (tx) => {
    const found = await tx.course.findMany({ where: { id: { in: courseIds }, ...courseScope(actor) }, select: { id: true, position: true } });
    if (found.length !== courseIds.length) throw authErrors.notFound("Course not found.");
    for (const [index, id] of courseIds.entries()) {
      await tx.course.update({ where: { id }, data: { position: index + 1 } });
    }
    await writeAudit(tx, {
      actorId: actor.user.id,
      action: "course.reorder",
      entityType: "course",
      entityId: courseIds[0],
      before: found.map((course) => ({ id: course.id, position: course.position })),
      after: courseIds.map((id, index) => ({ id, position: index + 1 })),
      source: options.source
    });
    return { order: courseIds };
  });
}

// ------------------------------------------------------------------------------------------------
// Weekly homework rule (per teacher)
// ------------------------------------------------------------------------------------------------

export type HomeworkRuleInput = { enabled: boolean; perWeek: number };

export function parseHomeworkRule(raw: Raw): HomeworkRuleInput {
  if (typeof raw.enabled !== "boolean") throw invalid("invalid-enabled", "Say whether the weekly rule is on or off.");
  const perWeek = Number(raw.perWeek);
  if (!Number.isInteger(perWeek) || perWeek < 1 || perWeek > 20) throw invalid("invalid-perWeek", "Homeworks per week must be a whole number from 1 to 20.");
  return { enabled: raw.enabled, perWeek };
}

/** The teacher's own rule settings (an administrator without a teacher profile gets the defaults). */
export async function getHomeworkRule(actor: ManagementActor): Promise<HomeworkRuleInput & { editable: boolean }> {
  if (!actor.instructorId) return { enabled: true, perWeek: 3, editable: false };
  const row = await retryOnDatabaseFailure(() =>
    prisma.instructor.findUnique({ where: { id: actor.instructorId! }, select: { homeworkRuleEnabled: true, homeworkPerWeek: true } })
  );
  return { enabled: row?.homeworkRuleEnabled ?? true, perWeek: row?.homeworkPerWeek ?? 3, editable: Boolean(row) };
}

/** Each teacher switches the rule on/off and sets the weekly number for their own students. */
export async function updateHomeworkRule(actor: ManagementActor, input: HomeworkRuleInput, options: Options) {
  if (!actor.instructorId) throw authErrors.forbidden("Only teachers have a weekly homework rule.");
  const instructorId = actor.instructorId;
  return prisma.$transaction(async (tx) => {
    const before = await tx.instructor.findUnique({ where: { id: instructorId }, select: { homeworkRuleEnabled: true, homeworkPerWeek: true } });
    if (!before) throw authErrors.notFound("Teacher profile not found.");
    const after = await tx.instructor.update({
      where: { id: instructorId },
      data: { homeworkRuleEnabled: input.enabled, homeworkPerWeek: input.perWeek },
      select: { homeworkRuleEnabled: true, homeworkPerWeek: true }
    });
    await writeAudit(tx, { actorId: actor.user.id, action: "homework.rule", entityType: "homework", entityId: instructorId, before, after, source: options.source });
    return { enabled: after.homeworkRuleEnabled, perWeek: after.homeworkPerWeek };
  });
}
