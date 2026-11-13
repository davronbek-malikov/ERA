import { UserRole, type EnrollmentStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { can, courseScope, enrollmentScope, examScope, requireStudentInScope, type ManagementActor } from "@/server/management/actor";
import { evaluateEnrollmentAccess } from "@/server/management/access";
import { isOverdue, summarizePayments, type PaymentStatus, type PaymentSummary } from "@/server/management/money";
import { visibleEmail } from "@/lib/student-contact";
import { getEnrollmentHomework } from "@/server/management/teaching";
import { addDays, fromDbDate, monthRange, toDbDate, todayInPlatform } from "@/server/management/time";

/*
 * Read models for Student Management (docs/ERA_STUDENT_MANAGEMENT.md). Every query starts from the actor's scope
 * (src/server/management/actor.ts). Money fields are null — not zero — when the actor may not see payments, so a
 * page can never show a misleading "₩0".
 */

const PAGE_SIZE = 25;
const UPCOMING_EXAM_DAYS = 14;

export type EnrollmentFilters = {
  q?: string;
  courseId?: string;
  instructorId?: string;
  paymentStatus?: PaymentStatus;
  /** "current" (default) = ACTIVE; "all" = every status. */
  enrollmentStatus?: EnrollmentStatus | "current" | "all";
  dateField?: "start" | "end";
  from?: string;
  to?: string;
  upcomingExams?: boolean;
  overdue?: boolean;
  pendingPayments?: boolean;
  studentId?: string;
  sort?: "student" | "course" | "start" | "end" | "price" | "paid" | "balance" | "status";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type EnrollmentRow = {
  id: string;
  /** email is null when the student has none (internal placeholder address). */
  student: { id: string; name: string; email: string | null; telegram: string | null };
  course: { id: string; title: string; slug: string };
  teacher: { id: string; name: string } | null;
  status: EnrollmentStatus;
  startDate: string | null;
  endDate: string | null;
  accessStatus: "ACTIVE" | "RESTRICTED" | "REVOKED";
  accessAllowed: boolean;
  arrangement: string | null;
  paymentDueDate: string | null;
  currency: string;
  money: (PaymentSummary & { overdue: boolean }) | null;
  hasUpcomingExam: boolean;
  /** Homework checking progress: lessons in the course and this student's reviews. */
  homework: { total: number; done: number; needsWork: number; toCheck: number };
  createdAt: string;
};

const ROW_INCLUDE = {
  user: { select: { id: true, name: true, email: true, telegram: true } },
  course: { select: { id: true, title: true, slug: true, _count: { select: { lessons: true } } } },
  instructor: { select: { id: true, name: true } },
  payments: { select: { kind: true, amount: true, status: true } },
  homeworkReviews: { select: { status: true } }
} satisfies Prisma.EnrollmentInclude;

type LoadedEnrollment = Prisma.EnrollmentGetPayload<{ include: typeof ROW_INCLUDE }>;

function statusWhere(value: EnrollmentFilters["enrollmentStatus"]): Prisma.EnrollmentWhereInput {
  if (!value || value === "current") return { status: "ACTIVE" };
  if (value === "all") return {};
  return { status: value };
}

/** Enrollment ids (within scope) that have an exam between `from` and `to`. */
async function enrollmentsWithExams(actor: ManagementActor, from: string, to: string) {
  const exams = await prisma.examSchedule.findMany({
    where: { ...examScope(actor), status: "SCHEDULED", examDate: { gte: toDbDate(from), lte: toDbDate(to) } },
    select: { courseId: true, participants: { select: { enrollmentId: true } } }
  });
  const ids = new Set<string>();
  const wholeCourses = new Set<string>();
  for (const exam of exams) {
    if (exam.participants.length) exam.participants.forEach((participant) => ids.add(participant.enrollmentId));
    else wholeCourses.add(exam.courseId);
  }
  return { ids, wholeCourses };
}

async function toRows(actor: ManagementActor, enrollments: LoadedEnrollment[], today: string): Promise<EnrollmentRow[]> {
  const showMoney = can(actor, "viewPayments");
  const exams = await enrollmentsWithExams(actor, today, addDays(today, UPCOMING_EXAM_DAYS));
  return Promise.all(
    enrollments.map(async (enrollment) => {
      const summary = summarizePayments(enrollment, enrollment.payments);
      const access = await evaluateEnrollmentAccess(enrollment, today);
      return {
        id: enrollment.id,
        student: { ...enrollment.user, email: visibleEmail(enrollment.user.email) },
        course: { id: enrollment.course.id, title: enrollment.course.title, slug: enrollment.course.slug },
        teacher: enrollment.instructor,
        status: enrollment.status,
        startDate: fromDbDate(enrollment.startDate),
        endDate: fromDbDate(enrollment.endDate),
        accessStatus: enrollment.accessStatus,
        accessAllowed: access.allowed,
        arrangement: enrollment.paymentArrangement,
        paymentDueDate: fromDbDate(enrollment.paymentDueDate),
        currency: enrollment.currency,
        money: showMoney ? { ...summary, overdue: isOverdue(summary, fromDbDate(enrollment.paymentDueDate), today) } : null,
        hasUpcomingExam: exams.ids.has(enrollment.id) || (enrollment.status === "ACTIVE" && exams.wholeCourses.has(enrollment.courseId)),
        homework: {
          total: enrollment.course._count.lessons,
          done: enrollment.homeworkReviews.filter((review) => review.status === "DONE").length,
          needsWork: enrollment.homeworkReviews.filter((review) => review.status === "NEEDS_WORK").length,
          toCheck: enrollment.homeworkReviews.filter((review) => review.status === "SUBMITTED").length
        },
        createdAt: enrollment.createdAt.toISOString()
      };
    })
  );
}

function compareRows(sort: NonNullable<EnrollmentFilters["sort"]>) {
  const text = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "");
  return (a: EnrollmentRow, b: EnrollmentRow) => {
    switch (sort) {
      case "student":
        return text(a.student.name, b.student.name);
      case "course":
        return text(a.course.title, b.course.title);
      case "start":
        return text(a.startDate, b.startDate);
      case "end":
        return text(a.endDate, b.endDate);
      case "price":
        return (a.money?.price ?? -1) - (b.money?.price ?? -1);
      case "paid":
        return (a.money?.approved ?? -1) - (b.money?.approved ?? -1);
      case "balance":
        return (a.money?.remaining ?? -1) - (b.money?.remaining ?? -1);
      case "status":
        return text(a.money?.status ?? null, b.money?.status ?? null);
    }
  };
}

/** The student table: one row per enrollment, filtered, sorted and paginated. */
export async function listEnrollmentRows(actor: ManagementActor, filters: EnrollmentFilters = {}) {
  const today = todayInPlatform();
  const q = filters.q?.trim();
  const dateColumn = filters.dateField === "end" ? "endDate" : "startDate";
  const dateRange =
    filters.from || filters.to
      ? { [dateColumn]: { ...(filters.from ? { gte: toDbDate(filters.from) } : {}), ...(filters.to ? { lte: toDbDate(filters.to) } : {}) } }
      : {};

  const where: Prisma.EnrollmentWhereInput = {
    AND: [
      enrollmentScope(actor),
      statusWhere(filters.enrollmentStatus),
      { user: { role: UserRole.STUDENT } },
      filters.courseId ? { courseId: filters.courseId } : {},
      filters.instructorId && actor.kind === "admin" ? { instructorId: filters.instructorId } : {},
      filters.studentId ? { userId: filters.studentId } : {},
      dateRange,
      q ? { user: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } } : {},
      filters.pendingPayments && can(actor, "viewPayments") ? { payments: { some: { status: "PENDING" } } } : {}
    ]
  };

  const enrollments = await retryOnDatabaseFailure(() =>
    prisma.enrollment.findMany({ where, include: ROW_INCLUDE, orderBy: [{ startDate: "desc" }, { createdAt: "desc" }], take: 2000 })
  );
  let rows = await toRows(actor, enrollments, today);

  if (can(actor, "viewPayments")) {
    if (filters.paymentStatus) rows = rows.filter((row) => row.money?.status === filters.paymentStatus);
    if (filters.overdue) rows = rows.filter((row) => row.money?.overdue);
  }
  if (filters.upcomingExams) rows = rows.filter((row) => row.hasUpcomingExam);

  if (filters.sort) {
    rows.sort(compareRows(filters.sort));
    if (filters.dir === "desc") rows.reverse();
  }

  const pageSize = Math.min(Math.max(filters.pageSize ?? PAGE_SIZE, 1), 200);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(filters.page ?? 1, 1), pages);
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pages, pageSize };
}

// ------------------------------------------------------------------------------------------------
// Summary cards
// ------------------------------------------------------------------------------------------------

export type ManagementSummary = {
  students: number;
  activeEnrollments: number;
  completedEnrollments: number;
  endingSoon: number;
  upcomingExams: number;
  money: null | {
    fullyPaid: number;
    partiallyPaid: number;
    unpaid: number;
    waived: number;
    overdue: number;
    collected: number;
    outstanding: number;
    pendingCount: number;
    pendingAmount: number;
    currency: string;
    from: string;
    to: string;
  };
};

export async function getManagementSummary(actor: ManagementActor, range: { from?: string; to?: string } = {}): Promise<ManagementSummary> {
  const today = todayInPlatform();
  const [monthStart, monthEnd] = monthRange(today);
  const from = range.from ?? monthStart;
  const to = range.to ?? monthEnd;
  const scope = enrollmentScope(actor);

  const [students, enrollments, collectedRows, pending, examCount] = await retryOnDatabaseFailure(() =>
    Promise.all([
      actor.kind === "admin"
        ? prisma.user.count({ where: { role: UserRole.STUDENT } })
        : prisma.user.count({ where: { role: UserRole.STUDENT, enrollments: { some: scope } } }),
      prisma.enrollment.findMany({
        where: { ...scope, status: { in: ["ACTIVE", "COMPLETED"] }, user: { role: UserRole.STUDENT } },
        select: {
          status: true,
          endDate: true,
          priceAmount: true,
          paymentArrangement: true,
          paymentDueDate: true,
          currency: true,
          payments: { select: { kind: true, amount: true, status: true } }
        }
      }),
      prisma.paymentTransaction.findMany({
        where: { status: "APPROVED", enrollment: scope, transactionDate: { gte: toDbDate(from), lte: toDbDate(to) } },
        select: { kind: true, amount: true, status: true }
      }),
      prisma.paymentTransaction.findMany({ where: { status: "PENDING", enrollment: scope }, select: { kind: true, amount: true } }),
      prisma.examSchedule.count({ where: { ...examScope(actor), status: "SCHEDULED", examDate: { gte: toDbDate(today), lte: toDbDate(addDays(today, UPCOMING_EXAM_DAYS)) } } })
    ])
  );

  const endingLimit = addDays(today, 30);
  const summary: ManagementSummary = {
    students,
    activeEnrollments: enrollments.filter((enrollment) => enrollment.status === "ACTIVE").length,
    completedEnrollments: enrollments.filter((enrollment) => enrollment.status === "COMPLETED").length,
    endingSoon: enrollments.filter((enrollment) => {
      const end = fromDbDate(enrollment.endDate);
      return enrollment.status === "ACTIVE" && end !== null && end >= today && end <= endingLimit;
    }).length,
    upcomingExams: examCount,
    money: null
  };

  if (can(actor, "viewPayments")) {
    const counts = { FULLY_PAID: 0, PARTIALLY_PAID: 0, UNPAID: 0, WAIVED: 0, NO_FEE: 0 };
    let outstanding = 0;
    let overdue = 0;
    for (const enrollment of enrollments) {
      const result = summarizePayments(enrollment, enrollment.payments);
      counts[result.status] += 1;
      outstanding += result.remaining;
      if (isOverdue(result, fromDbDate(enrollment.paymentDueDate), today)) overdue += 1;
    }
    summary.money = {
      fullyPaid: counts.FULLY_PAID,
      partiallyPaid: counts.PARTIALLY_PAID,
      unpaid: counts.UNPAID,
      waived: counts.WAIVED,
      overdue,
      collected: collectedRows.reduce((sum, row) => sum + (row.kind === "REFUND" ? -row.amount : row.amount), 0),
      outstanding,
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, row) => sum + (row.kind === "REFUND" ? -row.amount : row.amount), 0),
      currency: "KRW",
      from,
      to
    };
  }
  return summary;
}

// ------------------------------------------------------------------------------------------------
// Student profile
// ------------------------------------------------------------------------------------------------

export async function getStudentProfile(actor: ManagementActor, studentId: string) {
  const student = await requireStudentInScope(actor, studentId);
  const showMoney = can(actor, "viewPayments");
  const today = todayInPlatform();

  const [enrollments, notes] = await retryOnDatabaseFailure(() =>
    Promise.all([
      prisma.enrollment.findMany({
        where: { userId: student.id, ...enrollmentScope(actor) },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        include: {
          course: { select: { id: true, title: true, slug: true } },
          instructor: { select: { id: true, name: true } },
          accessGrantedBy: { select: { name: true } },
          payments: {
            orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
            include: {
              recordedBy: { select: { name: true } },
              reviewedBy: { select: { name: true } },
              reversedBy: { select: { name: true } }
            }
          },
          accessLogs: { orderBy: { createdAt: "desc" }, take: 20, include: { changedBy: { select: { name: true } } } },
          examEntries: { select: { examId: true } }
        }
      }),
      prisma.studentNote.findMany({
        where: {
          studentId: student.id,
          ...(actor.kind === "teacher" ? { OR: [{ createdById: actor.user.id }, { enrollment: { instructorId: actor.instructorId } }] } : {})
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { createdBy: { select: { name: true } }, enrollment: { select: { course: { select: { title: true } } } } }
      })
    ])
  );

  const courseIds = enrollments.map((enrollment) => enrollment.courseId);
  const exams = await prisma.examSchedule.findMany({
    where: {
      ...examScope(actor),
      courseId: { in: courseIds },
      examDate: { gte: toDbDate(addDays(today, -30)) },
      OR: [{ participants: { none: {} } }, { participants: { some: { enrollmentId: { in: enrollments.map((enrollment) => enrollment.id) } } } }]
    },
    orderBy: [{ examDate: "asc" }, { startTime: "asc" }],
    select: { id: true, title: true, examDate: true, startTime: true, endTime: true, status: true, course: { select: { title: true } } }
  });

  const enrollmentViews = await Promise.all(
    enrollments.map(async (enrollment) => {
      const summary = summarizePayments(enrollment, enrollment.payments);
      const [access, homework] = await Promise.all([evaluateEnrollmentAccess(enrollment, today), getEnrollmentHomework(enrollment.id, enrollment.courseId)]);
      return {
        homework,
        id: enrollment.id,
        course: enrollment.course,
        teacher: enrollment.instructor,
        status: enrollment.status,
        startDate: fromDbDate(enrollment.startDate),
        endDate: fromDbDate(enrollment.endDate),
        completedAt: enrollment.completedAt?.toISOString() ?? null,
        progress: enrollment.progress,
        currency: enrollment.currency,
        arrangement: enrollment.paymentArrangement,
        paymentDueDate: fromDbDate(enrollment.paymentDueDate),
        accessStatus: enrollment.accessStatus,
        accessAllowed: access.allowed,
        accessBlockReason: access.allowed ? null : access.reason,
        accessExpiresAt: fromDbDate(enrollment.accessExpiresAt),
        restrictWhenOverdue: enrollment.restrictWhenOverdue,
        accessGrantedBy: enrollment.accessGrantedBy?.name ?? null,
        accessNote: enrollment.accessNote,
        internalNote: enrollment.internalNote,
        money: showMoney ? { ...summary, overdue: isOverdue(summary, fromDbDate(enrollment.paymentDueDate), today) } : null,
        payments: showMoney
          ? enrollment.payments.map((payment) => ({
              id: payment.id,
              kind: payment.kind,
              amount: payment.amount,
              currency: payment.currency,
              method: payment.method,
              transactionDate: fromDbDate(payment.transactionDate),
              status: payment.status,
              reference: payment.reference,
              description: payment.description,
              source: payment.source,
              recordedBy: payment.recordedBy?.name ?? null,
              recordedById: payment.recordedById,
              reviewedBy: payment.reviewedBy?.name ?? null,
              reviewedAt: payment.reviewedAt?.toISOString() ?? null,
              rejectionReason: payment.rejectionReason,
              reversedBy: payment.reversedBy?.name ?? null,
              reversedAt: payment.reversedAt?.toISOString() ?? null,
              reversalReason: payment.reversalReason,
              correctionOfId: payment.correctionOfId,
              createdAt: payment.createdAt.toISOString()
            }))
          : [],
        accessLog: enrollment.accessLogs.map((log) => ({
          id: log.id,
          previousStatus: log.previousStatus,
          newStatus: log.newStatus,
          newExpiresAt: fromDbDate(log.newExpiresAt),
          arrangement: log.arrangement,
          reason: log.reason,
          source: log.source,
          changedBy: log.changedBy?.name ?? null,
          createdAt: log.createdAt.toISOString()
        }))
      };
    })
  );

  const teachers = [...new Map(enrollmentViews.filter((view) => view.teacher).map((view) => [view.teacher!.id, view.teacher!])).values()];
  return {
    student: { ...student, email: visibleEmail(student.email), createdAt: student.createdAt.toISOString() },
    teachers,
    current: enrollmentViews.filter((view) => view.status === "ACTIVE"),
    history: enrollmentViews.filter((view) => view.status !== "ACTIVE"),
    notes: notes.map((note) => ({
      id: note.id,
      note: note.note,
      author: note.createdBy?.name ?? null,
      course: note.enrollment?.course.title ?? null,
      createdAt: note.createdAt.toISOString()
    })),
    exams: exams.map((exam) => ({ ...exam, examDate: fromDbDate(exam.examDate), course: exam.course.title })),
    canSeeMoney: showMoney
  };
}

// ------------------------------------------------------------------------------------------------
// Payments list
// ------------------------------------------------------------------------------------------------

export type PaymentFilters = {
  status?: "PENDING" | "APPROVED" | "REJECTED" | "REVERSED";
  from?: string;
  to?: string;
  q?: string;
  studentId?: string;
  enrollmentId?: string;
  page?: number;
  pageSize?: number;
};

export async function listPayments(actor: ManagementActor, filters: PaymentFilters = {}) {
  if (!can(actor, "viewPayments")) return null;
  const q = filters.q?.trim();
  const where: Prisma.PaymentTransactionWhereInput = {
    enrollment: {
      ...enrollmentScope(actor),
      ...(filters.studentId ? { userId: filters.studentId } : {}),
      ...(q ? { user: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } } : {})
    },
    ...(filters.enrollmentId ? { enrollmentId: filters.enrollmentId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.from || filters.to
      ? { transactionDate: { ...(filters.from ? { gte: toDbDate(filters.from) } : {}), ...(filters.to ? { lte: toDbDate(filters.to) } : {}) } }
      : {})
  };
  const pageSize = Math.min(Math.max(filters.pageSize ?? 50, 1), 200);
  const [total, rows] = await retryOnDatabaseFailure(() =>
    Promise.all([
      prisma.paymentTransaction.count({ where }),
      prisma.paymentTransaction.findMany({
        where,
        orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
        skip: (Math.max(filters.page ?? 1, 1) - 1) * pageSize,
        take: pageSize,
        include: {
          enrollment: { select: { id: true, user: { select: { id: true, name: true } }, course: { select: { title: true } } } },
          recordedBy: { select: { name: true } },
          reviewedBy: { select: { name: true } },
          reversedBy: { select: { name: true } }
        }
      })
    ])
  );
  return {
    total,
    page: Math.max(filters.page ?? 1, 1),
    pages: Math.max(1, Math.ceil(total / pageSize)),
    rows: rows.map((row) => ({
      id: row.id,
      enrollmentId: row.enrollmentId,
      student: row.enrollment.user,
      course: row.enrollment.course.title,
      kind: row.kind,
      amount: row.amount,
      currency: row.currency,
      method: row.method,
      transactionDate: fromDbDate(row.transactionDate),
      status: row.status,
      reference: row.reference,
      description: row.description,
      source: row.source,
      recordedBy: row.recordedBy?.name ?? null,
      recordedById: row.recordedById,
      reviewedBy: row.reviewedBy?.name ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason,
      reversedBy: row.reversedBy?.name ?? null,
      reversalReason: row.reversalReason,
      correctionOfId: row.correctionOfId,
      createdAt: row.createdAt.toISOString()
    }))
  };
}

// ------------------------------------------------------------------------------------------------
// Calendar
// ------------------------------------------------------------------------------------------------

export type CalendarEvent = {
  id: string;
  kind: "exam" | "course-start" | "course-end" | "payment-due";
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  detail: string;
  courseId: string;
  teacher: string | null;
  studentId: string | null;
  examId?: string;
  status?: string;
  students?: Array<{ id: string; name: string }>;
};

export async function listCalendarEvents(
  actor: ManagementActor,
  range: { from: string; to: string; courseId?: string; instructorId?: string; studentId?: string; kinds?: CalendarEvent["kind"][] }
): Promise<CalendarEvent[]> {
  const from = toDbDate(range.from);
  const to = toDbDate(range.to);
  const kinds = new Set(range.kinds ?? ["exam", "course-start", "course-end", "payment-due"]);
  const enrollmentWhere: Prisma.EnrollmentWhereInput = {
    ...enrollmentScope(actor),
    ...(range.courseId ? { courseId: range.courseId } : {}),
    ...(range.instructorId && actor.kind === "admin" ? { instructorId: range.instructorId } : {}),
    ...(range.studentId ? { userId: range.studentId } : {})
  };

  const [exams, enrollments] = await retryOnDatabaseFailure(() =>
    Promise.all([
      kinds.has("exam")
        ? prisma.examSchedule.findMany({
            where: {
              ...examScope(actor),
              examDate: { gte: from, lte: to },
              ...(range.courseId ? { courseId: range.courseId } : {}),
              ...(range.instructorId && actor.kind === "admin" ? { instructorId: range.instructorId } : {})
            },
            orderBy: [{ examDate: "asc" }, { startTime: "asc" }],
            include: {
              course: { select: { title: true, enrollments: { where: { ...enrollmentScope(actor), status: "ACTIVE" }, select: { id: true, user: { select: { id: true, name: true } } } } } },
              instructor: { select: { name: true } },
              participants: { select: { enrollment: { select: { id: true, user: { select: { id: true, name: true } } } } } }
            }
          })
        : [],
      prisma.enrollment.findMany({
        where: {
          ...enrollmentWhere,
          status: { in: ["ACTIVE", "COMPLETED"] },
          OR: [{ startDate: { gte: from, lte: to } }, { endDate: { gte: from, lte: to } }, { paymentDueDate: { gte: from, lte: to } }]
        },
        include: ROW_INCLUDE
      })
    ])
  );

  const events: CalendarEvent[] = [];
  for (const exam of exams) {
    const students = exam.participants.length
      ? exam.participants.map((participant) => participant.enrollment.user)
      : exam.course.enrollments.map((enrollment) => enrollment.user);
    if (range.studentId && !students.some((student) => student.id === range.studentId)) continue;
    events.push({
      id: `exam:${exam.id}`,
      kind: "exam",
      examId: exam.id,
      date: fromDbDate(exam.examDate),
      startTime: exam.startTime,
      endTime: exam.endTime,
      title: exam.title,
      detail: exam.course.title,
      courseId: exam.courseId,
      teacher: exam.instructor?.name ?? null,
      studentId: null,
      status: exam.status,
      students
    });
  }

  const showMoney = can(actor, "viewPayments");
  for (const enrollment of enrollments) {
    const start = fromDbDate(enrollment.startDate);
    const end = fromDbDate(enrollment.endDate);
    const due = fromDbDate(enrollment.paymentDueDate);
    const base = { courseId: enrollment.courseId, teacher: enrollment.instructor?.name ?? null, studentId: enrollment.userId, startTime: null, endTime: null };
    if (kinds.has("course-start") && start && start >= range.from && start <= range.to) {
      events.push({ ...base, id: `start:${enrollment.id}`, kind: "course-start", date: start, title: `${enrollment.user.name} starts`, detail: enrollment.course.title });
    }
    if (kinds.has("course-end") && end && end >= range.from && end <= range.to) {
      events.push({ ...base, id: `end:${enrollment.id}`, kind: "course-end", date: end, title: `${enrollment.user.name} finishes`, detail: enrollment.course.title });
    }
    if (showMoney && kinds.has("payment-due") && due && due >= range.from && due <= range.to) {
      const summary = summarizePayments(enrollment, enrollment.payments);
      if (summary.remaining > 0) {
        events.push({ ...base, id: `due:${enrollment.id}`, kind: "payment-due", date: due, title: `${enrollment.user.name}: payment due`, detail: enrollment.course.title, status: summary.status });
      }
    }
  }
  return events.sort((a, b) => (a.date + (a.startTime ?? "")).localeCompare(b.date + (b.startTime ?? "")));
}

// ------------------------------------------------------------------------------------------------
// Lookups for forms and the AI
// ------------------------------------------------------------------------------------------------

/**
 * Student accounts by name or email. Admins and teachers allowed to create enrollments search all students
 * (to enroll someone new); other teachers only find their own students.
 */
export async function searchStudentAccounts(actor: ManagementActor, query: string, limit = 20) {
  const q = query.trim();
  const own = actor.kind === "teacher" && !can(actor, "manageEnrollments");
  return retryOnDatabaseFailure(() =>
    prisma.user.findMany({
      where: {
        role: UserRole.STUDENT,
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
        ...(own || actor.kind === "teacher" && !q ? { enrollments: { some: enrollmentScope(actor) } } : {})
      },
      orderBy: { name: "asc" },
      take: limit,
      select: { id: true, name: true, email: true, telegram: true, status: true }
    })
  ).then((rows) => rows.map((row) => ({ ...row, email: visibleEmail(row.email) })));
}

export async function listScopedCourses(actor: ManagementActor) {
  return retryOnDatabaseFailure(() =>
    prisma.course.findMany({
      where: courseScope(actor),
      // The teacher's own order (Courses & lessons → ↑ ↓), then creation order.
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, slug: true, status: true, instructorId: true, instructor: { select: { name: true } } }
    })
  );
}

export async function listInstructorsForActor(actor: ManagementActor) {
  return retryOnDatabaseFailure(() =>
    prisma.instructor.findMany({
      where: actor.kind === "admin" ? {} : { id: actor.instructorId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, userId: true }
    })
  );
}

/** Active enrollments of one course in scope (exam participant picker). */
export async function listCourseEnrollments(actor: ManagementActor, courseId: string) {
  return retryOnDatabaseFailure(() =>
    prisma.enrollment.findMany({
      where: { ...enrollmentScope(actor), courseId, status: "ACTIVE" },
      orderBy: { user: { name: "asc" } },
      select: { id: true, user: { select: { id: true, name: true } } }
    })
  );
}
