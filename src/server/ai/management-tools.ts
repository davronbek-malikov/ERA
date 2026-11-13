import type { AiAgent, EnrollmentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { RequestError } from "@/lib/validation";
import { abandonActions, createPendingAction, type ActionPreview } from "@/server/ai/actions";
import type { AgentToolset, ToolCall, ToolDefinition, ToolOutcome } from "@/server/ai/types";
import { can, enrollmentScope as enrollmentScopeFor, getManagementActor, type ManagementActor } from "@/server/management/actor";
import type { AuthUser } from "@/server/authz";
import { checkAccessChange, checkCreateEnrollment, checkUpdateEnrollment, changeEnrollmentAccess, createEnrollment, updateEnrollment } from "@/server/management/enrollments";
import { checkExam, saveExam } from "@/server/management/exams";
import {
  ACCESS_ACTIONS,
  ENROLLMENT_STATUSES,
  PAYMENT_ARRANGEMENTS,
  PAYMENT_METHODS,
  parseAccessChange,
  parseCreateEnrollment,
  parseExam,
  parsePaymentDecision,
  parseRecordPayment,
  parseUpdateEnrollment
} from "@/server/management/inputs";
import { formatMoney, PAYMENT_STATUS_LABEL, PAYMENT_STATUSES, summarizePayments, type PaymentStatus } from "@/server/management/money";
import { checkPaymentDecision, checkRecordPayment, decidePayment, recordPayment } from "@/server/management/payments";
import {
  getManagementSummary,
  getStudentProfile,
  listCalendarEvents,
  listEnrollmentRows,
  listPayments,
  listScopedCourses,
  searchStudentAccounts
} from "@/server/management/queries";
import {
  addLesson,
  checkCourse,
  checkHomeworkReview,
  checkLessonUpdate,
  checkNewStudent,
  createCourseWithLessons,
  createStudent,
  HOMEWORK_LABEL,
  HOMEWORK_STATUSES,
  listTeachingCourses,
  parseCourse,
  parseHomeworkReview,
  parseLessonUpdate,
  parseNewStudent,
  reviewHomework,
  updateLesson
} from "@/server/management/teaching";
import { addDays, formatCalendarDate, isDateString, monthRange, platformTimezone, todayInPlatform, weekday, WEEKDAY_NAMES } from "@/server/management/time";

/*
 * Student Management tools for the Teacher and Admin assistants (docs/ERA_STUDENT_MANAGEMENT.md, "AI assistant").
 *
 *  - Read tools (find_*, list_*, get_*, financial_summary) run immediately through the same query functions as
 *    the pages, with the user's own scope and permissions. Money is omitted when the user may not see it.
 *  - Write tools (propose_*) never change data. They validate the request exactly like the real operation
 *    (same parser, same check function), then store a pending action with a preview. The user confirms it with
 *    a button; only then does executeManagementAction run the real operation, once.
 *  - There is no free-form query or SQL tool. Every input is validated server-side; IDs must come from tool
 *    results, and a record outside the user's scope is "not found".
 */

const MAX_RESULT_CHARS = 14_000;

type ToolContext = { actor: ManagementActor; agent: AiAgent; conversationId: string | null };

type ToolSpec = {
  definition: ToolDefinition;
  label: string;
  /** Hidden from the model when the actor can't use it at all. */
  available: (actor: ManagementActor) => boolean;
  run: (input: Record<string, unknown>, context: ToolContext) => Promise<ToolOutcome>;
};

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

function json(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}… (truncated: ask a narrower question)` : text;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function dateArg(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (!isDateString(value)) throw new RequestError(400, `invalid-${field}`, `${field} must be a date in YYYY-MM-DD format.`);
  return value;
}

function limitArg(value: unknown, fallback: number, max: number) {
  return typeof value === "number" && Number.isInteger(value) ? Math.min(Math.max(value, 1), max) : fallback;
}

function money(amount: number | null, currency: string) {
  return formatMoney(amount, currency);
}

const ARRANGEMENT_LABEL: Record<string, string> = { PAY_IN_FULL: "Pay in full", PARTIAL: "Partial payments", PAY_LATER: "Pay Later", WAIVED: "Free / waived" };
const METHOD_LABEL: Record<string, string> = { BANK_TRANSFER: "Bank transfer", CASH: "Cash", ONLINE: "Online", OTHER: "Other" };

async function propose(context: ToolContext, kind: string, payload: Record<string, unknown>, preview: ActionPreview): Promise<ToolOutcome> {
  const action = await createPendingAction({
    userId: context.actor.user.id,
    agent: context.agent,
    conversationId: context.conversationId,
    kind,
    payload,
    preview
  });
  return {
    action,
    content: json({
      status: "awaiting_user_confirmation",
      actionId: action.id,
      summary: preview.title,
      instruction:
        "Nothing has been changed yet. Tell the user briefly what will happen and that they must press Confirm on the card below (or Cancel). Do not say it is done."
    })
  };
}

// ------------------------------------------------------------------------------------------------
// Read tools
// ------------------------------------------------------------------------------------------------

const readTools: Record<string, ToolSpec> = {
  find_students: {
    label: "Looking up students",
    available: () => true,
    definition: {
      name: "find_students",
      description:
        "Find student accounts by (part of) name or email. Use it to identify the right student before anything else. If several students match, ask the user which one they mean (show name and email). Returns ids to use in other tools.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Name or email, e.g. 'Ali' or 'ali@'" }, limit: { type: "integer", minimum: 1, maximum: 25 } },
        required: ["query"],
        additionalProperties: false
      }
    },
    async run(input, { actor }) {
      const query = str(input.query) ?? "";
      const students = await searchStudentAccounts(actor, query, limitArg(input.limit, 10, 25));
      const enrollments = students.length
        ? await listEnrollmentRows(actor, { enrollmentStatus: "all", pageSize: 200 }).then((result) =>
            result.rows.filter((row) => students.some((student) => student.id === row.student.id))
          )
        : [];
      return {
        content: json({
          matches: students.map((student) => ({
            studentId: student.id,
            name: student.name,
            email: student.email,
            accountStatus: student.status,
            enrollments: enrollments
              .filter((row) => row.student.id === student.id)
              .map((row) => ({ enrollmentId: row.id, course: row.course.title, status: row.status, start: row.startDate, end: row.endDate }))
          })),
          note: students.length > 1 ? "Several students match: ask the user to choose before acting." : undefined
        })
      };
    }
  },

  list_enrollments: {
    label: "Searching enrollments",
    available: () => true,
    definition: {
      name: "list_enrollments",
      description:
        "List enrollments (one row per student per course) with dates, teacher, access and — if the user may see payments — price, approved paid amount, remaining balance and payment status. Use for questions like 'who hasn't paid', 'who has outstanding balances', 'overdue payments', 'courses ending this month', 'my active LLM students', 'students in course X'. Payment statuses: FULLY_PAID, PARTIALLY_PAID, UNPAID, WAIVED, NO_FEE. Only APPROVED payments count as paid.",
      inputSchema: {
        type: "object",
        properties: {
          studentQuery: { type: "string", description: "Filter by student name or email" },
          courseId: { type: "string" },
          paymentStatus: { type: "string", enum: PAYMENT_STATUSES },
          enrollmentStatus: { type: "string", enum: ["current", "all", ...ENROLLMENT_STATUSES], description: "Default 'current' (ACTIVE)" },
          overdueOnly: { type: "boolean" },
          outstandingOnly: { type: "boolean", description: "Only enrollments with a remaining balance > 0" },
          pendingPaymentsOnly: { type: "boolean" },
          upcomingExamsOnly: { type: "boolean", description: "Exam within the next 14 days" },
          endingFrom: { type: "string", description: "YYYY-MM-DD" },
          endingTo: { type: "string", description: "YYYY-MM-DD" },
          startingFrom: { type: "string", description: "YYYY-MM-DD" },
          startingTo: { type: "string", description: "YYYY-MM-DD" },
          limit: { type: "integer", minimum: 1, maximum: 100 }
        },
        additionalProperties: false
      }
    },
    async run(input, { actor }) {
      const endingFrom = dateArg(input.endingFrom, "endingFrom");
      const endingTo = dateArg(input.endingTo, "endingTo");
      const startingFrom = dateArg(input.startingFrom, "startingFrom");
      const startingTo = dateArg(input.startingTo, "startingTo");
      const byEnd = Boolean(endingFrom || endingTo);
      const status = str(input.enrollmentStatus) as EnrollmentStatus | "current" | "all" | undefined;
      const result = await listEnrollmentRows(actor, {
        q: str(input.studentQuery),
        courseId: str(input.courseId),
        paymentStatus: PAYMENT_STATUSES.includes(input.paymentStatus as PaymentStatus) ? (input.paymentStatus as PaymentStatus) : undefined,
        enrollmentStatus: status && (status === "current" || status === "all" || ENROLLMENT_STATUSES.includes(status as EnrollmentStatus)) ? status : "current",
        overdue: input.overdueOnly === true,
        pendingPayments: input.pendingPaymentsOnly === true,
        upcomingExams: input.upcomingExamsOnly === true,
        dateField: byEnd ? "end" : "start",
        from: byEnd ? endingFrom : startingFrom,
        to: byEnd ? endingTo : startingTo,
        sort: "student",
        pageSize: 200
      });
      let rows = result.rows;
      if (input.outstandingOnly === true) rows = rows.filter((row) => (row.money?.remaining ?? 0) > 0);
      const limit = limitArg(input.limit, 50, 100);
      return {
        content: json({
          total: rows.length,
          shown: Math.min(rows.length, limit),
          paymentsVisible: can(actor, "viewPayments"),
          enrollments: rows.slice(0, limit).map((row) => ({
            enrollmentId: row.id,
            studentId: row.student.id,
            student: row.student.name,
            email: row.student.email,
            course: row.course.title,
            courseId: row.course.id,
            teacher: row.teacher?.name ?? null,
            status: row.status,
            start: row.startDate,
            end: row.endDate,
            access: row.accessAllowed ? "can study" : `blocked (${row.accessStatus.toLowerCase()})`,
            arrangement: row.arrangement,
            paymentDueDate: row.paymentDueDate,
            ...(row.money
              ? {
                  price: row.money.price,
                  approvedPaid: row.money.approved,
                  pendingVerification: row.money.pending,
                  remaining: row.money.remaining,
                  paymentStatus: row.money.status,
                  overdue: row.money.overdue,
                  currency: row.currency
                }
              : {}),
            upcomingExam: row.hasUpcomingExam
          }))
        })
      };
    }
  },

  get_student_profile: {
    label: "Opening the student profile",
    available: () => true,
    definition: {
      name: "get_student_profile",
      description:
        "Full profile of one student: current enrollments, course history (completed/cancelled/expired), payments with their verification status (if visible to the user), access history, upcoming exams and notes. Use for 'show Ali's course history'.",
      inputSchema: { type: "object", properties: { studentId: { type: "string" } }, required: ["studentId"], additionalProperties: false }
    },
    async run(input, { actor }) {
      const studentId = str(input.studentId);
      if (!studentId) throw new RequestError(400, "invalid-studentId", "studentId is required (get it from find_students).");
      const profile = await getStudentProfile(actor, studentId);
      const enrollment = (view: (typeof profile.current)[number]) => ({
        enrollmentId: view.id,
        course: view.course.title,
        teacher: view.teacher?.name ?? null,
        status: view.status,
        start: view.startDate,
        end: view.endDate,
        access: view.accessAllowed ? "can study" : `blocked (${view.accessBlockReason})`,
        arrangement: view.arrangement,
        paymentDueDate: view.paymentDueDate,
        accessExpiresAt: view.accessExpiresAt,
        ...(view.money
          ? { price: view.money.price, approvedPaid: view.money.approved, remaining: view.money.remaining, paymentStatus: view.money.status, overdue: view.money.overdue, currency: view.currency }
          : {}),
        homework: view.homework.map((lesson) => ({
          lessonId: lesson.id,
          lesson: `${lesson.position}. ${lesson.title}`,
          status: lesson.review?.status ?? "NOT_SUBMITTED",
          link: lesson.review?.githubUrl ?? null,
          note: lesson.review?.note ?? null
        })),
        payments: view.payments.map((payment) => ({
          transactionId: payment.id,
          kind: payment.kind,
          amount: payment.amount,
          date: payment.transactionDate,
          method: payment.method,
          status: payment.status,
          recordedBy: payment.recordedBy,
          reviewedBy: payment.reviewedBy,
          rejectionReason: payment.rejectionReason,
          reversalReason: payment.reversalReason
        }))
      });
      return {
        content: json({
          student: {
            studentId: profile.student.id,
            name: profile.student.name,
            email: profile.student.email,
            github: profile.student.githubUrl,
            accountStatus: profile.student.status,
            registered: profile.student.createdAt.slice(0, 10)
          },
          teachers: profile.teachers.map((teacher) => teacher.name),
          currentEnrollments: profile.current.map(enrollment),
          courseHistory: profile.history.map(enrollment),
          exams: profile.exams.map((exam) => ({ title: exam.title, course: exam.course, date: exam.examDate, start: exam.startTime, end: exam.endTime, status: exam.status })),
          notes: profile.notes.slice(0, 10).map((note) => ({ note: note.note, author: note.author, date: note.createdAt.slice(0, 10) }))
        })
      };
    }
  },

  find_courses: {
    label: "Looking up courses",
    available: () => true,
    definition: {
      name: "find_courses",
      description:
        "Courses this user may manage (admins: all; teachers: their own), with ids and teachers. Match the user's course name loosely (e.g. 'LLM 1' may be 'LLM Engineering 1'); if more than one course could match, ask which one.",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, additionalProperties: false }
    },
    async run(input, { actor }) {
      const query = str(input.query)?.toLowerCase();
      const courses = await listScopedCourses(actor);
      const words = query ? query.split(/\s+/).filter(Boolean) : [];
      const matched = words.length ? courses.filter((course) => words.every((word) => course.title.toLowerCase().includes(word))) : courses;
      const list = matched.length || !words.length ? matched : courses.filter((course) => words.some((word) => course.title.toLowerCase().includes(word)));
      return {
        content: json({
          courses: list.slice(0, 40).map((course) => ({ courseId: course.id, title: course.title, teacher: course.instructor.name, teacherId: course.instructorId, published: course.status === "PUBLISHED" }))
        })
      };
    }
  },

  list_payments: {
    label: "Checking payments",
    available: (actor) => can(actor, "viewPayments"),
    definition: {
      name: "list_payments",
      description:
        "Individual payment transactions with their verification status: PENDING (recorded, awaiting approval), APPROVED (counts), REJECTED, REVERSED. Use for 'who has pending payments' or a student's payment list. Dates are payment dates.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED", "REVERSED"] },
          studentId: { type: "string" },
          from: { type: "string", description: "YYYY-MM-DD" },
          to: { type: "string", description: "YYYY-MM-DD" },
          limit: { type: "integer", minimum: 1, maximum: 100 }
        },
        additionalProperties: false
      }
    },
    async run(input, { actor }) {
      const status = ["PENDING", "APPROVED", "REJECTED", "REVERSED"].includes(String(input.status)) ? (input.status as "PENDING") : undefined;
      const result = await listPayments(actor, {
        status,
        studentId: str(input.studentId),
        from: dateArg(input.from, "from"),
        to: dateArg(input.to, "to"),
        pageSize: limitArg(input.limit, 50, 100)
      });
      return {
        content: json({
          total: result?.total ?? 0,
          payments: (result?.rows ?? []).map((row) => ({
            transactionId: row.id,
            enrollmentId: row.enrollmentId,
            student: row.student.name,
            studentId: row.student.id,
            course: row.course,
            kind: row.kind,
            amount: row.amount,
            currency: row.currency,
            date: row.transactionDate,
            method: row.method,
            status: row.status,
            recordedBy: row.recordedBy,
            reviewedBy: row.reviewedBy,
            rejectionReason: row.rejectionReason
          }))
        })
      };
    }
  },

  financial_summary: {
    label: "Adding up payments",
    available: (actor) => can(actor, "viewPayments"),
    definition: {
      name: "financial_summary",
      description:
        "Totals from APPROVED transactions: money collected in a date range (default: this month), current outstanding balances, how many enrollments are fully/partially paid/unpaid/overdue, and payments pending verification. Use for 'how much did I collect this month'.",
      inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, additionalProperties: false }
    },
    async run(input, { actor }) {
      const summary = await getManagementSummary(actor, { from: dateArg(input.from, "from"), to: dateArg(input.to, "to") });
      return { content: json({ ...summary, note: "collected = approved payments minus approved refunds in the range; outstanding = what is still owed now." }) };
    }
  },

  list_course_lessons: {
    label: "Reading the lessons",
    available: () => true,
    definition: {
      name: "list_course_lessons",
      description:
        "Lessons of the user's courses in order, with what the teacher taught and the homework of each lesson (lessonId for other tools). Without courseId: every course. Use it before checking or discussing a student's homework.",
      inputSchema: { type: "object", properties: { courseId: { type: "string" } }, additionalProperties: false }
    },
    async run(input, { actor }) {
      const courseId = str(input.courseId);
      const courses = (await listTeachingCourses(actor)).filter((course) => !courseId || course.id === courseId);
      return {
        content: json({
          courses: courses.map((course) => ({
            courseId: course.id,
            title: course.title,
            activeStudents: course.activeStudents,
            lessons: course.lessons.map((lesson) => ({ lessonId: lesson.id, number: lesson.position, title: lesson.title, taught: lesson.taughtSummary, homework: lesson.homework }))
          }))
        })
      };
    }
  },

  list_homework: {
    label: "Checking homework",
    available: () => true,
    definition: {
      name: "list_homework",
      description:
        "Homework check status per student and lesson for active enrollments: DONE (done correctly), NEEDS_WORK, SUBMITTED (waiting to be checked), NOT_SUBMITTED. Filter by course, lesson number or status. Use for 'who hasn't done lesson 3's homework' or 'what do I still need to check'.",
      inputSchema: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          lessonNumber: { type: "integer", minimum: 1 },
          status: { type: "string", enum: HOMEWORK_STATUSES }
        },
        additionalProperties: false
      }
    },
    async run(input, { actor }) {
      const courseId = str(input.courseId);
      const lessonNumber = typeof input.lessonNumber === "number" ? input.lessonNumber : undefined;
      const status = HOMEWORK_STATUSES.includes(input.status as (typeof HOMEWORK_STATUSES)[number]) ? (input.status as string) : undefined;
      const enrollments = await prisma.enrollment.findMany({
        where: { ...enrollmentScopeFor(actor), status: "ACTIVE", ...(courseId ? { courseId } : {}) },
        select: {
          id: true,
          user: { select: { name: true, githubUrl: true } },
          course: { select: { title: true, lessons: { orderBy: { position: "asc" }, select: { id: true, position: true, title: true } } } },
          homeworkReviews: { select: { lessonId: true, status: true, githubUrl: true, note: true } }
        },
        take: 300
      });
      const rows = enrollments.flatMap((enrollment) =>
        enrollment.course.lessons
          .filter((lesson) => !lessonNumber || lesson.position === lessonNumber)
          .map((lesson) => {
            const review = enrollment.homeworkReviews.find((item) => item.lessonId === lesson.id);
            return {
              enrollmentId: enrollment.id,
              student: enrollment.user.name,
              github: enrollment.user.githubUrl,
              course: enrollment.course.title,
              lessonId: lesson.id,
              lesson: `${lesson.position}. ${lesson.title}`,
              status: review?.status ?? "NOT_SUBMITTED",
              link: review?.githubUrl ?? null,
              note: review?.note ?? null
            };
          })
          .filter((row) => !status || row.status === status)
      );
      return { content: json({ total: rows.length, homework: rows.slice(0, 150) }) };
    }
  },

  list_exams: {
    label: "Checking the exam schedule",
    available: () => true,
    definition: {
      name: "list_exams",
      description:
        "Exams scheduled between two dates (inclusive), with course, time and the students taking them. For 'this Saturday' compute the date from today's date given in the instructions.",
      inputSchema: {
        type: "object",
        properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" }, courseId: { type: "string" }, studentId: { type: "string" } },
        required: ["from", "to"],
        additionalProperties: false
      }
    },
    async run(input, { actor }) {
      const from = dateArg(input.from, "from")!;
      const to = dateArg(input.to, "to")!;
      if (!from || !to) throw new RequestError(400, "invalid-range", "from and to are required.");
      const events = await listCalendarEvents(actor, { from, to, courseId: str(input.courseId), studentId: str(input.studentId), kinds: ["exam"] });
      return {
        content: json({
          exams: events.map((event) => ({
            examId: event.examId,
            title: event.title,
            course: event.detail,
            date: event.date,
            weekday: WEEKDAY_NAMES[weekday(event.date)],
            start: event.startTime,
            end: event.endTime,
            status: event.status,
            teacher: event.teacher,
            students: event.students?.map((student) => student.name) ?? []
          }))
        })
      };
    }
  }
};

// ------------------------------------------------------------------------------------------------
// Proposal tools
// ------------------------------------------------------------------------------------------------

const proposalTools: Record<string, ToolSpec> = {
  propose_enrollment: {
    label: "Preparing the enrollment",
    available: (actor) => can(actor, "manageEnrollments"),
    definition: {
      name: "propose_enrollment",
      description:
        "Propose a NEW enrollment of an existing student in a course (never overwrites an earlier one). Get studentId from find_students and courseId from find_courses first. Price is an integer in won (500,000 KRW → 500000). If the user didn't say how they'll pay, use PAY_IN_FULL. PAY_LATER needs paymentDueDate. An optional initial payment is recorded as PENDING.",
      inputSchema: {
        type: "object",
        properties: {
          studentId: { type: "string" },
          courseId: { type: "string" },
          teacherId: { type: "string", description: "Instructor id; omit to use the course's teacher" },
          startDate: { type: "string", description: "YYYY-MM-DD" },
          endDate: { type: "string", description: "YYYY-MM-DD" },
          priceAmount: { type: "integer", minimum: 0 },
          currency: { type: "string", enum: ["KRW"] },
          paymentArrangement: { type: "string", enum: PAYMENT_ARRANGEMENTS },
          paymentDueDate: { type: "string", description: "YYYY-MM-DD" },
          grantAccess: { type: "boolean", description: "Default true" },
          initialPaymentAmount: { type: "integer", minimum: 1 },
          initialPaymentMethod: { type: "string", enum: PAYMENT_METHODS },
          note: { type: "string" }
        },
        required: ["studentId", "courseId", "startDate", "paymentArrangement"],
        additionalProperties: false
      }
    },
    async run(input, context) {
      const today = todayInPlatform();
      const raw = {
        studentId: input.studentId,
        courseId: input.courseId,
        instructorId: input.teacherId,
        startDate: input.startDate,
        endDate: input.endDate,
        priceAmount: input.priceAmount,
        currency: input.currency ?? "KRW",
        paymentArrangement: input.paymentArrangement,
        paymentDueDate: input.paymentDueDate,
        grantAccess: input.grantAccess,
        accessNote: input.paymentArrangement === "PAY_LATER" ? (str(input.note) ?? "Pay Later approved via ERA Assistant") : undefined,
        internalNote: input.paymentArrangement === "PAY_LATER" ? undefined : str(input.note),
        initialPayment: input.initialPaymentAmount ? { amount: input.initialPaymentAmount, method: input.initialPaymentMethod ?? "BANK_TRANSFER", transactionDate: today } : undefined
      };
      const parsed = parseCreateEnrollment(raw, today);
      const checked = await checkCreateEnrollment(prisma, context.actor, parsed);
      const warnings: string[] = [];
      if (parsed.paymentArrangement === "PAY_LATER") warnings.push(`Pay Later: ${checked.student.name} can study now while the payment status stays Unpaid. Payment due ${formatCalendarDate(parsed.paymentDueDate)}.`);
      if (parsed.initialPayment) warnings.push("The initial payment is recorded as PENDING and counts only after it is approved.");
      if (checked.accessStatus === "RESTRICTED") warnings.push("Course access starts restricted until it is granted.");
      if (checked.course.status !== "PUBLISHED") warnings.push("This course isn't published yet, so the student can't open it until it is.");
      return propose(context, "create_enrollment", raw, {
        title: `Enroll ${checked.student.name} in ${checked.course.title}`,
        lines: [
          { label: "Student", value: `${checked.student.name} (${checked.student.email})` },
          { label: "Course", value: checked.course.title },
          { label: "Teacher", value: checked.instructor.name },
          { label: "Dates", value: `${formatCalendarDate(parsed.startDate)} → ${formatCalendarDate(parsed.endDate)}` },
          { label: "Price", value: parsed.priceAmount === null ? "—" : money(parsed.priceAmount, parsed.currency) },
          { label: "Payment arrangement", value: ARRANGEMENT_LABEL[parsed.paymentArrangement] },
          ...(parsed.paymentDueDate ? [{ label: "Payment due", value: formatCalendarDate(parsed.paymentDueDate) }] : []),
          ...(parsed.initialPayment ? [{ label: "Initial payment", value: `${money(parsed.initialPayment.amount, parsed.currency)} · ${METHOD_LABEL[parsed.initialPayment.method]} · pending` }] : []),
          { label: "Course access", value: checked.accessStatus === "ACTIVE" ? "Can study" : "Restricted" }
        ],
        warnings
      });
    }
  },

  propose_payment: {
    label: "Preparing the payment record",
    available: (actor) => can(actor, "recordPayments"),
    definition: {
      name: "propose_payment",
      description:
        "Propose recording a payment (or refund) the student made OUTSIDE ERA (bank transfer, cash…). It will be saved as PENDING and must be approved before it counts. Identify the enrollment first (list_enrollments or get_student_profile); if the student has several active enrollments and the course is unclear, ask. Amount is an integer in won. Default date: today.",
      inputSchema: {
        type: "object",
        properties: {
          enrollmentId: { type: "string" },
          amount: { type: "integer", minimum: 1 },
          kind: { type: "string", enum: ["PAYMENT", "REFUND"] },
          method: { type: "string", enum: PAYMENT_METHODS },
          transactionDate: { type: "string", description: "YYYY-MM-DD" },
          reference: { type: "string" },
          note: { type: "string" }
        },
        required: ["enrollmentId", "amount"],
        additionalProperties: false
      }
    },
    async run(input, context) {
      const today = todayInPlatform();
      const raw = {
        enrollmentId: input.enrollmentId,
        amount: input.amount,
        kind: input.kind ?? "PAYMENT",
        method: input.method ?? "BANK_TRANSFER",
        transactionDate: input.transactionDate ?? today,
        reference: input.reference,
        description: input.note
      };
      const parsed = parseRecordPayment(raw, today);
      const { enrollment, summary } = await checkRecordPayment(prisma, context.actor, parsed);
      const after = summary.price !== null ? Math.max(0, summary.price - summary.approved - (parsed.kind === "REFUND" ? -parsed.amount : parsed.amount)) : null;
      return propose(context, "record_payment", raw, {
        title: `Record ${parsed.kind === "REFUND" ? "a refund" : "a payment"} of ${money(parsed.amount, enrollment.currency)} for ${enrollment.user.name}`,
        lines: [
          { label: "Student", value: enrollment.user.name },
          { label: "Course", value: enrollment.course.title },
          { label: "Amount", value: money(parsed.amount, enrollment.currency) },
          { label: "Method", value: METHOD_LABEL[parsed.method] },
          { label: "Payment date", value: formatCalendarDate(parsed.transactionDate) },
          { label: "Approved so far", value: `${money(summary.approved, enrollment.currency)} of ${money(summary.price, enrollment.currency)}` },
          ...(after !== null ? [{ label: "Remaining after approval", value: money(after, enrollment.currency) }] : [])
        ],
        warnings: ["Saved as PENDING: it won't reduce the balance until an authorized person verifies the money arrived and approves it."]
      });
    }
  },

  propose_payment_review: {
    label: "Preparing the payment review",
    available: (actor) => can(actor, "approvePayments"),
    definition: {
      name: "propose_payment_review",
      description:
        "Propose approving or rejecting a PENDING payment, or reversing an APPROVED one. Find the transactionId with list_payments or get_student_profile; if several payments could match, ask. Reject and reverse need a reason.",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string" },
          decision: { type: "string", enum: ["approve", "reject", "reverse"] },
          reason: { type: "string" }
        },
        required: ["transactionId", "decision"],
        additionalProperties: false
      }
    },
    async run(input, context) {
      const raw = { decision: input.decision, reason: input.reason, note: input.decision === "approve" ? input.reason : undefined };
      const parsed = parsePaymentDecision(raw);
      const { transaction, before } = await checkPaymentDecision(prisma, context.actor, String(input.transactionId ?? ""), parsed);
      const currency = transaction.currency;
      const signed = transaction.kind === "REFUND" ? -transaction.amount : transaction.amount;
      const approvedAfter = parsed.decision === "approve" ? before.approved + signed : parsed.decision === "reverse" ? before.approved - signed : before.approved;
      const after = summarizePayments(transaction.enrollment, [{ kind: "PAYMENT", amount: approvedAfter, status: "APPROVED" }]);
      const verb = parsed.decision === "approve" ? "Approve" : parsed.decision === "reject" ? "Reject" : "Reverse";
      return propose(context, "payment_decision", { transactionId: transaction.id, ...raw }, {
        title: `${verb} ${transaction.enrollment.user.name}'s ${money(transaction.amount, currency)} ${transaction.kind === "REFUND" ? "refund" : "payment"}`,
        lines: [
          { label: "Student", value: transaction.enrollment.user.name },
          { label: "Course", value: transaction.enrollment.course.title },
          { label: "Amount", value: `${money(transaction.amount, currency)} · ${METHOD_LABEL[transaction.method]} · ${formatCalendarDate(fromDb(transaction.transactionDate))}` },
          { label: "Current status", value: transaction.status },
          { label: "Payment status after", value: `${PAYMENT_STATUS_LABEL[after.status]} · remaining ${money(after.remaining, currency)}` },
          ...("reason" in parsed ? [{ label: "Reason", value: parsed.reason }] : [])
        ],
        warnings: parsed.decision === "approve" ? ["Approve only if you have verified the money was actually received."] : []
      });
    }
  },

  propose_payment_correction: {
    label: "Preparing the correction",
    available: (actor) => can(actor, "recordPayments"),
    definition: {
      name: "propose_payment_correction",
      description:
        "Propose correcting a recorded payment's amount (e.g. 'Ali actually paid 150,000, not 100,000'). The original is kept (reversed if approved, rejected if pending) and a new PENDING payment with the right amount is linked to it. Needs a reason.",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string" },
          correctAmount: { type: "integer", minimum: 1 },
          reason: { type: "string" },
          transactionDate: { type: "string", description: "YYYY-MM-DD, only if the date was also wrong" }
        },
        required: ["transactionId", "correctAmount", "reason"],
        additionalProperties: false
      }
    },
    async run(input, context) {
      const raw = { decision: "correct", amount: input.correctAmount, reason: input.reason, transactionDate: input.transactionDate };
      const parsed = parsePaymentDecision(raw);
      const { transaction } = await checkPaymentDecision(prisma, context.actor, String(input.transactionId ?? ""), parsed);
      const currency = transaction.currency;
      return propose(context, "payment_decision", { transactionId: transaction.id, ...raw }, {
        title: `Correct ${transaction.enrollment.user.name}'s payment: ${money(transaction.amount, currency)} → ${money(input.correctAmount as number, currency)}`,
        lines: [
          { label: "Student", value: transaction.enrollment.user.name },
          { label: "Course", value: transaction.enrollment.course.title },
          { label: "Original", value: `${money(transaction.amount, currency)} (${transaction.status.toLowerCase()}) — kept, marked ${transaction.status === "APPROVED" ? "reversed" : "rejected"}` },
          { label: "New record", value: `${money(input.correctAmount as number, currency)} · pending approval` },
          { label: "Reason", value: String(input.reason) }
        ],
        warnings: ["Nothing is deleted. The new amount counts only after it is approved."]
      });
    }
  },

  propose_enrollment_update: {
    label: "Preparing the change",
    available: (actor) => can(actor, "manageEnrollments") || can(actor, "manageAccess"),
    definition: {
      name: "propose_enrollment_update",
      description:
        "Propose changing an existing enrollment: start/end dates (e.g. 'extend by two weeks' → compute the new end date), payment due date, status (COMPLETED, CANCELLED, EXPIRED, TRANSFERRED, ACTIVE) or price. Identify the enrollment first.",
      inputSchema: {
        type: "object",
        properties: {
          enrollmentId: { type: "string" },
          startDate: { type: "string", description: "YYYY-MM-DD" },
          endDate: { type: "string", description: "YYYY-MM-DD" },
          paymentDueDate: { type: "string", description: "YYYY-MM-DD" },
          status: { type: "string", enum: ENROLLMENT_STATUSES },
          priceAmount: { type: "integer", minimum: 0 },
          reason: { type: "string" }
        },
        required: ["enrollmentId"],
        additionalProperties: false
      }
    },
    async run(input, context) {
      const raw = {
        startDate: input.startDate,
        endDate: input.endDate,
        paymentDueDate: input.paymentDueDate,
        status: input.status,
        priceAmount: input.priceAmount,
        reason: input.reason
      };
      const parsed = parseUpdateEnrollment(raw);
      const enrollmentId = String(input.enrollmentId ?? "");
      const { current } = await checkUpdateEnrollment(prisma, context.actor, enrollmentId, parsed);
      const lines: ActionPreview["lines"] = [
        { label: "Student", value: current.user.name },
        { label: "Course", value: current.course.title }
      ];
      const change = (label: string, before: string, after: string) => lines.push({ label, value: `${before} → ${after}` });
      if (parsed.startDate !== undefined) change("Start", formatCalendarDate(fromDb(current.startDate)), formatCalendarDate(parsed.startDate));
      if (parsed.endDate !== undefined) change("End", formatCalendarDate(fromDb(current.endDate)), formatCalendarDate(parsed.endDate));
      if (parsed.paymentDueDate !== undefined) change("Payment due", formatCalendarDate(fromDb(current.paymentDueDate)), formatCalendarDate(parsed.paymentDueDate));
      if (parsed.status !== undefined) change("Status", current.status, parsed.status);
      if (parsed.priceAmount !== undefined) change("Price", money(current.priceAmount, current.currency), money(parsed.priceAmount, current.currency));
      if (parsed.reason) lines.push({ label: "Reason", value: parsed.reason });
      const warnings = parsed.status && ["CANCELLED", "EXPIRED", "TRANSFERRED"].includes(parsed.status) ? ["The student loses course access; the enrollment stays in their history."] : [];
      return propose(context, "update_enrollment", { enrollmentId, ...raw }, { title: `Update ${current.user.name}'s ${current.course.title} enrollment`, lines, warnings });
    }
  },

  propose_access_change: {
    label: "Preparing the access change",
    available: (actor) => can(actor, "manageAccess"),
    definition: {
      name: "propose_access_change",
      description:
        "Propose a course-access change for one enrollment: grant_pay_later (study now, pay by paymentDueDate; payment status stays as it is), restrict (pause), revoke (end), restore, extend (new last day of access in accessExpiresAt), set_overdue_rule (restrictWhenOverdue). Always include a reason.",
      inputSchema: {
        type: "object",
        properties: {
          enrollmentId: { type: "string" },
          action: { type: "string", enum: ACCESS_ACTIONS },
          reason: { type: "string" },
          paymentDueDate: { type: "string", description: "YYYY-MM-DD (required for grant_pay_later)" },
          accessExpiresAt: { type: "string", description: "YYYY-MM-DD (required for extend)" },
          restrictWhenOverdue: { type: "boolean" }
        },
        required: ["enrollmentId", "action", "reason"],
        additionalProperties: false
      }
    },
    async run(input, context) {
      const raw = {
        action: input.action,
        reason: input.reason,
        paymentDueDate: input.paymentDueDate,
        accessExpiresAt: input.accessExpiresAt,
        restrictWhenOverdue: input.restrictWhenOverdue
      };
      const parsed = parseAccessChange(raw);
      const enrollmentId = String(input.enrollmentId ?? "");
      const { current, next } = await checkAccessChange(prisma, context.actor, enrollmentId, parsed);
      const payments = can(context.actor, "viewPayments")
        ? summarizePayments(current, await prisma.paymentTransaction.findMany({ where: { enrollmentId: current.id }, select: { kind: true, amount: true, status: true } }))
        : null;
      const label: Record<string, string> = {
        grant_pay_later: "Grant Pay Later",
        restrict: "Restrict access",
        revoke: "Revoke access",
        restore: "Restore access",
        extend: "Extend access",
        set_overdue_rule: "Change the overdue rule"
      };
      const warnings: string[] = [];
      if (parsed.action === "grant_pay_later") warnings.push("The student can study while unpaid. The payment status does not change.");
      if (parsed.action === "revoke" || parsed.action === "restrict") warnings.push("The student can't open lessons or the tutor until access is restored.");
      return propose(context, "access_change", { enrollmentId, ...raw }, {
        title: `${label[parsed.action]}: ${current.user.name} · ${current.course.title}`,
        lines: [
          { label: "Access", value: `${current.accessStatus} → ${next.accessStatus}` },
          ...(next.arrangement !== current.paymentArrangement ? [{ label: "Arrangement", value: `${ARRANGEMENT_LABEL[current.paymentArrangement ?? ""] ?? "—"} → ${ARRANGEMENT_LABEL[next.arrangement ?? ""] ?? "—"}` }] : []),
          ...(next.paymentDueDate !== fromDb(current.paymentDueDate) ? [{ label: "Payment due", value: formatCalendarDate(next.paymentDueDate) }] : []),
          ...(next.accessExpiresAt !== fromDb(current.accessExpiresAt) ? [{ label: "Last day of access", value: formatCalendarDate(next.accessExpiresAt) }] : []),
          ...(next.restrictWhenOverdue !== current.restrictWhenOverdue ? [{ label: "Stop access when overdue", value: next.restrictWhenOverdue ? "Yes" : "No" }] : []),
          ...(payments ? [{ label: "Payment status (unchanged)", value: `${PAYMENT_STATUS_LABEL[payments.status]} · remaining ${money(payments.remaining, current.currency)}` }] : []),
          { label: "Reason", value: parsed.reason }
        ],
        warnings
      });
    }
  },

  propose_student: {
    label: "Preparing the new student",
    available: (actor) => can(actor, "manageEnrollments"),
    definition: {
      name: "propose_student",
      description:
        "Propose adding a NEW student account (name, email, optional GitHub and phone) and optionally enrolling them in a course (courseId from find_courses, startDate, endDate, priceAmount in won). Check with find_students first that they don't already exist. ERA generates a temporary password shown after confirmation.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          githubUrl: { type: "string" },
          phone: { type: "string" },
          courseId: { type: "string" },
          startDate: { type: "string", description: "YYYY-MM-DD" },
          endDate: { type: "string", description: "YYYY-MM-DD" },
          priceAmount: { type: "integer", minimum: 0 },
          paymentArrangement: { type: "string", enum: PAYMENT_ARRANGEMENTS }
        },
        required: ["name", "email"],
        additionalProperties: false
      }
    },
    async run(input, context) {
      const raw = {
        name: input.name,
        email: input.email,
        githubUrl: input.githubUrl,
        phone: input.phone,
        ...(input.courseId
          ? {
              courseId: input.courseId,
              startDate: input.startDate ?? todayInPlatform(),
              endDate: input.endDate,
              priceAmount: input.priceAmount ?? 0,
              paymentArrangement: input.paymentArrangement ?? "PAY_IN_FULL"
            }
          : {})
      };
      const parsed = parseNewStudent(raw);
      await checkNewStudent(context.actor, parsed);
      const course = input.courseId ? (await listScopedCourses(context.actor)).find((item) => item.id === input.courseId) : null;
      if (input.courseId && !course) throw new RequestError(404, "not-found", "Course not found.");
      return propose(context, "create_student", raw, {
        title: `Add student ${parsed.name}`,
        lines: [
          { label: "Name", value: parsed.name },
          { label: "Email", value: parsed.email },
          ...(parsed.githubUrl ? [{ label: "GitHub", value: parsed.githubUrl }] : []),
          ...(course
            ? [
                { label: "Course", value: course.title },
                { label: "Dates", value: `${formatCalendarDate(String(raw.startDate))} → ${formatCalendarDate(typeof raw.endDate === "string" ? raw.endDate : null)}` },
                { label: "Tuition", value: money(Number(raw.priceAmount ?? 0), "KRW") }
              ]
            : [{ label: "Course", value: "Not enrolled yet" }])
        ],
        warnings: ["A temporary password will be shown once after you confirm. Give it to the student."]
      });
    }
  },

  propose_course: {
    label: "Preparing the course",
    available: () => true,
    definition: {
      name: "propose_course",
      description:
        "Propose creating a course for this teacher with its lessons in order. Each lesson can include what was taught (taughtSummary) and the homework. E.g. 'Machine Learning Foundation, 4 weeks, 11 lessons'. If the user gives only a number of lessons, use titles 'Lesson 1', 'Lesson 2', …",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          durationWeeks: { type: "integer", minimum: 1, maximum: 104 },
          lessons: {
            type: "array",
            maxItems: 60,
            items: {
              type: "object",
              properties: { title: { type: "string" }, taughtSummary: { type: "string" }, homework: { type: "string" } },
              required: ["title"],
              additionalProperties: false
            }
          }
        },
        required: ["title", "lessons"],
        additionalProperties: false
      }
    },
    async run(input, context) {
      const raw = { title: input.title, description: input.description, durationWeeks: input.durationWeeks, lessons: input.lessons };
      const parsed = parseCourse(raw);
      const { instructor } = await checkCourse(context.actor, parsed);
      return propose(context, "create_course", raw, {
        title: `Create course "${parsed.title}"`,
        lines: [
          { label: "Teacher", value: instructor.name },
          ...(parsed.durationWeeks ? [{ label: "Duration", value: `${parsed.durationWeeks} weeks` }] : []),
          { label: "Lessons", value: `${parsed.lessons.length}: ${parsed.lessons.slice(0, 6).map((lesson, i) => `${i + 1}. ${lesson.title}`).join(", ")}${parsed.lessons.length > 6 ? ", …" : ""}` },
          { label: "With homework", value: `${parsed.lessons.filter((lesson) => lesson.homework).length} of ${parsed.lessons.length}` }
        ],
        warnings: []
      });
    }
  },

  propose_lesson: {
    label: "Preparing the lesson",
    available: () => true,
    definition: {
      name: "propose_lesson",
      description:
        "Propose adding a lesson to a course (courseId, title, taughtSummary, homework) or, with lessonId, updating an existing lesson's title, what was taught or its homework. Get ids from list_course_lessons.",
      inputSchema: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          lessonId: { type: "string" },
          title: { type: "string" },
          taughtSummary: { type: "string" },
          homework: { type: "string" }
        },
        additionalProperties: false
      }
    },
    async run(input, context) {
      const raw = { title: input.title, taughtSummary: input.taughtSummary, homework: input.homework };
      const lessonId = str(input.lessonId);
      if (lessonId) {
        const parsed = parseLessonUpdate(raw);
        const lesson = await checkLessonUpdate(context.actor, lessonId);
        return propose(context, "update_lesson", { lessonId, ...raw }, {
          title: `Update lesson ${lesson.position} of ${lesson.course.title}`,
          lines: [
            { label: "Lesson", value: `${lesson.position}. ${parsed.title ?? lesson.title}` },
            ...(parsed.taughtSummary !== undefined ? [{ label: "What I taught", value: parsed.taughtSummary ?? "—" }] : []),
            ...(parsed.homework !== undefined ? [{ label: "Homework", value: parsed.homework ?? "—" }] : [])
          ],
          warnings: []
        });
      }
      const courseId = str(input.courseId);
      if (!courseId || !str(input.title)) throw new RequestError(400, "invalid-lesson", "To add a lesson give courseId and title (or lessonId to update one).");
      const parsed = parseLessonUpdate(raw);
      const course = (await listScopedCourses(context.actor)).find((item) => item.id === courseId);
      if (!course) throw new RequestError(404, "not-found", "Course not found.");
      return propose(context, "add_lesson", { courseId, ...raw }, {
        title: `Add a lesson to ${course.title}`,
        lines: [
          { label: "Title", value: parsed.title ?? "" },
          { label: "What I taught", value: parsed.taughtSummary ?? "—" },
          { label: "Homework", value: parsed.homework ?? "—" }
        ],
        warnings: []
      });
    }
  },

  propose_homework_review: {
    label: "Preparing the homework check",
    available: () => true,
    definition: {
      name: "propose_homework_review",
      description:
        "Propose recording the teacher's check of one student's homework for one lesson: status DONE (done correctly), NEEDS_WORK, SUBMITTED or NOT_SUBMITTED, with the link to the student's work and a note. Get enrollmentId and lessonId from list_homework or get_student_profile.",
      inputSchema: {
        type: "object",
        properties: {
          enrollmentId: { type: "string" },
          lessonId: { type: "string" },
          status: { type: "string", enum: HOMEWORK_STATUSES },
          githubUrl: { type: "string" },
          note: { type: "string" }
        },
        required: ["enrollmentId", "lessonId", "status"],
        additionalProperties: false
      }
    },
    async run(input, context) {
      const raw = { enrollmentId: input.enrollmentId, lessonId: input.lessonId, status: input.status, githubUrl: input.githubUrl, note: input.note };
      const parsed = parseHomeworkReview(raw);
      const { enrollment, lesson, current } = await checkHomeworkReview(context.actor, parsed);
      return propose(context, "homework_review", raw, {
        title: `Homework: ${enrollment.user.name} · lesson ${lesson.position}`,
        lines: [
          { label: "Student", value: enrollment.user.name },
          { label: "Lesson", value: `${lesson.position}. ${lesson.title} (${enrollment.course.title})` },
          { label: "Result", value: `${current ? HOMEWORK_LABEL[current.status] : HOMEWORK_LABEL.NOT_SUBMITTED} → ${HOMEWORK_LABEL[parsed.status]}` },
          ...(parsed.githubUrl ? [{ label: "Link", value: parsed.githubUrl }] : []),
          ...(parsed.note ? [{ label: "Note", value: parsed.note }] : [])
        ],
        warnings: []
      });
    }
  },

  propose_exam: {
    label: "Preparing the exam",
    available: () => true,
    definition: {
      name: "propose_exam",
      description:
        "Propose scheduling an exam for a course. Times are HH:MM (24-hour) in the platform timezone. Without enrollmentIds the exam applies to every active student of the course.",
      inputSchema: {
        type: "object",
        properties: {
          courseId: { type: "string" },
          title: { type: "string" },
          examDate: { type: "string", description: "YYYY-MM-DD" },
          startTime: { type: "string", description: "HH:MM" },
          endTime: { type: "string", description: "HH:MM" },
          description: { type: "string" },
          enrollmentIds: { type: "array", items: { type: "string" } }
        },
        required: ["courseId", "title", "examDate", "startTime"],
        additionalProperties: false
      }
    },
    async run(input, context) {
      const raw = { ...input };
      const parsed = parseExam(raw);
      const { course, instructor } = await checkExam(prisma, context.actor, parsed);
      return propose(context, "create_exam", raw, {
        title: `Schedule "${parsed.title}" for ${course.title}`,
        lines: [
          { label: "Course", value: course.title },
          { label: "Teacher", value: instructor.name },
          { label: "Date", value: formatCalendarDate(parsed.examDate, { weekday: true }) },
          { label: "Time", value: `${parsed.startTime}${parsed.endTime ? `–${parsed.endTime}` : ""} (${platformTimezone()})` },
          { label: "Students", value: parsed.enrollmentIds.length ? `${parsed.enrollmentIds.length} selected` : "Everyone active in the course" }
        ],
        warnings: []
      });
    }
  }
};

function fromDb(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

// ------------------------------------------------------------------------------------------------
// Toolset and execution
// ------------------------------------------------------------------------------------------------

const ALL_TOOLS: Record<string, ToolSpec> = { ...readTools, ...proposalTools };

function instructionsFor(actor: ManagementActor) {
  const today = todayInPlatform();
  const [monthStart, monthEnd] = monthRange(today);
  return [
    "ERA Student Management tools — rules:",
    `- Today is ${today} (${WEEKDAY_NAMES[weekday(today)]}) in ${platformTimezone()}. This month is ${monthStart} to ${monthEnd}. Next 7 days end ${addDays(today, 7)}. Always pass dates as YYYY-MM-DD; work out "this Saturday", "today", "in two weeks" from today's date.`,
    "- Questions (who, how many, how much, when) → call the read tools and answer ONLY from their results. Mention counts and names exactly as returned. If nothing matches, say so.",
    "- Changes (enroll, record or approve a payment, correct, change dates, Pay Later, restrict/revoke/extend access, schedule an exam) → first identify the exact records with read tools, then call ONE propose_* tool. It only creates a proposal; the user confirms with the button under your reply. Never say a change is done before that, and never ask the user to type 'yes' instead.",
    "- If a student or course name matches more than one record, or a student has several active enrollments and the course is unclear, ASK the user to choose (show the options) instead of guessing. If a required detail (dates, price, amount) is missing, ask for it.",
    "- Money: integers in Korean won. 500,000 KRW → 500000. Only APPROVED payments count as paid. A newly recorded payment is PENDING until someone verifies it; say so.",
    "- Payment status (paid/unpaid) and course access are different things. Pay Later lets an unpaid student study.",
    "- Homework checking: each lesson has what the teacher taught and the homework (list_course_lessons). A student's homework per lesson is DONE (done correctly), NEEDS_WORK, SUBMITTED (waiting to be checked) or NOT_SUBMITTED (list_homework, get_student_profile). You can't open GitHub yourself: compare what the teacher tells you with the homework text, and record the result with propose_homework_review.",
    "- If a tool returns an error (permission, not found, conflict), explain it plainly; don't retry with invented ids.",
    can(actor, "viewPayments") ? "" : "- This user may not see payment information: don't speculate about prices, payments or balances."
  ]
    .filter(Boolean)
    .join(String.fromCharCode(10));
}

/** The toolset for one Teacher/Admin assistant run, or undefined when the user can't manage students. */
export async function buildManagementToolset(user: AuthUser, agent: "teacher" | "admin", conversationId: string | null): Promise<AgentToolset | undefined> {
  const actor = await getManagementActor(user, agent);
  if (!actor) return undefined;
  const specs = Object.values(ALL_TOOLS).filter((spec) => spec.available(actor));
  const agentEnum: AiAgent = agent === "admin" ? "ADMIN_ASSISTANT" : "TEACHER_ASSISTANT";
  const context: ToolContext = { actor, agent: agentEnum, conversationId };
  const proposed: string[] = [];

  return {
    definitions: specs.map((spec) => spec.definition),
    label: (name) => ALL_TOOLS[name]?.label ?? "Working",
    instructions: instructionsFor(actor),
    async execute(call: ToolCall): Promise<ToolOutcome> {
      const spec = specs.find((candidate) => candidate.definition.name === call.name);
      if (!spec) return { isError: true, content: json({ error: `Unknown or unavailable tool: ${call.name}` }) };
      try {
        const outcome = await spec.run(call.input ?? {}, context);
        if (outcome.action) proposed.push(outcome.action.id);
        return outcome;
      } catch (error) {
        if (error instanceof RequestError) return { isError: true, content: json({ error: error.message, code: error.code }) };
        console.error(`[ai-tools] ${call.name} failed: ${error instanceof Error ? error.message : String(error)}`);
        return { isError: true, content: json({ error: "The lookup failed. Try again or ask the user to use the Student Management page." }) };
      }
    },
    async abandon() {
      await abandonActions(user.id, proposed);
    }
  };
}

/**
 * Runs a confirmed proposal with the user's CURRENT permissions. The payload is parsed again with the same
 * parsers, and the operation's own transaction re-checks every rule. The action id is the idempotency key.
 */
export async function executeManagementAction(user: AuthUser, action: { id: string; kind: string; payload: Record<string, unknown>; agent: AiAgent }) {
  const actor = await getManagementActor(user, action.agent === "ADMIN_ASSISTANT" ? "admin" : "teacher");
  if (!actor) throw new RequestError(403, "forbidden", "You no longer have access to student management.");
  const payload = action.payload;
  const today = todayInPlatform();
  const options = { source: "AI" as const };

  switch (action.kind) {
    case "create_enrollment": {
      const result = await createEnrollment(actor, { ...parseCreateEnrollment(payload, today), idempotencyKey: `ai-action:${action.id}` }, options);
      return { message: `${result.studentName} is enrolled in ${result.courseTitle}.${result.paymentId ? " The initial payment is pending approval." : ""}`, data: result };
    }
    case "record_payment": {
      const result = await recordPayment(actor, { ...parseRecordPayment(payload, today), idempotencyKey: `ai-action:${action.id}` }, options);
      return {
        message: `Recorded ${formatMoney(result.transaction.amount, result.transaction.currency)} as PENDING. It counts once it is approved.`,
        data: { transactionId: result.transaction.id }
      };
    }
    case "payment_decision": {
      const decision = parsePaymentDecision(payload);
      const result = await decidePayment(
        actor,
        String(payload.transactionId ?? ""),
        decision.decision === "correct" ? { ...decision, idempotencyKey: `ai-action:${action.id}` } : decision,
        options
      );
      const word = { approve: "approved", reject: "rejected", reverse: "reversed", correct: "corrected" }[decision.decision];
      return {
        message:
          decision.decision === "correct" && result.correction
            ? `Payment corrected: the original is kept as ${result.original?.status.toLowerCase() ?? "corrected"} and ${formatMoney(result.correction.amount, result.correction.currency)} is recorded as pending.`
            : `Payment ${word}.`,
        data: { transactionId: payload.transactionId }
      };
    }
    case "update_enrollment": {
      const result = await updateEnrollment(actor, String(payload.enrollmentId ?? ""), parseUpdateEnrollment(payload), options);
      return { message: `Updated ${result.studentName}'s ${result.courseTitle} enrollment.`, data: result.after };
    }
    case "access_change": {
      const result = await changeEnrollmentAccess(actor, String(payload.enrollmentId ?? ""), parseAccessChange(payload), options);
      return { message: `Access updated for ${result.studentName} in ${result.courseTitle}: ${result.after.accessStatus.toLowerCase()}.`, data: result.after };
    }
    case "create_exam": {
      const result = await saveExam(actor, parseExam(payload), options);
      return { message: `Exam scheduled for ${result.courseTitle} on ${formatCalendarDate(result.exam.examDate, { weekday: true })}.`, data: { examId: result.examId } };
    }
    case "create_student": {
      const result = await createStudent(actor, parseNewStudent(payload), options);
      return {
        message: `${result.student.name} was added (${result.student.email})${result.enrollment ? ` and enrolled in ${result.enrollment.courseTitle}` : ""}.${
          result.temporaryPassword ? ` Temporary password: ${result.temporaryPassword} — give it to the student.` : ""
        }`,
        data: { studentId: result.student.id }
      };
    }
    case "create_course": {
      const result = await createCourseWithLessons(actor, parseCourse(payload), options);
      return { message: `Course "${result.title}" created with ${result.lessons} lessons.`, data: { courseId: result.courseId } };
    }
    case "add_lesson": {
      const parsed = parseLessonUpdate(payload);
      const result = await addLesson(actor, String(payload.courseId ?? ""), { title: parsed.title ?? "Lesson", taughtSummary: parsed.taughtSummary ?? null, homework: parsed.homework ?? null }, options);
      return { message: `Lesson ${result.position} "${result.title}" added to ${result.courseTitle}.`, data: { lessonId: result.lessonId } };
    }
    case "update_lesson": {
      const result = await updateLesson(actor, String(payload.lessonId ?? ""), parseLessonUpdate(payload), options);
      return { message: `Lesson ${result.position} of ${result.courseTitle} updated.`, data: { lessonId: result.lessonId } };
    }
    case "homework_review": {
      const result = await reviewHomework(actor, parseHomeworkReview(payload), options);
      return { message: `Homework saved: ${result.student}, lesson ${result.lesson} — ${HOMEWORK_LABEL[result.status]}.`, data: { reviewId: result.reviewId } };
    }
    default:
      throw new RequestError(400, "unknown-action", "This proposal type isn't supported.");
  }
}
