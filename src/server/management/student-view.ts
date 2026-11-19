import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { evaluateEnrollmentAccess } from "@/server/management/access";
import { isOverdue, summarizePayments } from "@/server/management/money";
import { fromDbDate, todayInPlatform } from "@/server/management/time";

/*
 * What a student sees about their OWN enrollments (docs/ERA_STUDENT_MANAGEMENT.md, "Student view").
 * Shown: course, teacher, dates, access, payment status, remaining balance, due date, and the student's own
 * transactions with their status. Never shown: internal notes, approval notes, who approved what, other students.
 * The student id always comes from the session.
 */
export async function getMyEnrollments(userId: string) {
  const today = todayInPlatform();
  const enrollments = await retryOnDatabaseFailure(() =>
    prisma.enrollment.findMany({
      where: { userId },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        progress: true,
        priceAmount: true,
        currency: true,
        paymentArrangement: true,
        paymentDueDate: true,
        accessStatus: true,
        accessExpiresAt: true,
        restrictWhenOverdue: true,
        course: { select: { title: true, slug: true, status: true } },
        instructor: { select: { name: true } },
        payments: {
          where: { status: { in: ["PENDING", "APPROVED", "REVERSED"] } },
          orderBy: { transactionDate: "desc" },
          select: { id: true, kind: true, amount: true, currency: true, transactionDate: true, status: true, method: true }
        }
      }
    })
  );

  const views = await Promise.all(
    enrollments.map(async (enrollment) => {
      const summary = summarizePayments(enrollment, enrollment.payments);
      const access = await evaluateEnrollmentAccess(enrollment, today);
      const due = fromDbDate(enrollment.paymentDueDate);
      return {
        id: enrollment.id,
        course: enrollment.course,
        teacher: enrollment.instructor?.name ?? null,
        status: enrollment.status,
        startDate: fromDbDate(enrollment.startDate),
        endDate: fromDbDate(enrollment.endDate),
        progress: enrollment.progress,
        currency: enrollment.currency,
        payLater: enrollment.paymentArrangement === "PAY_LATER",
        paymentDueDate: due,
        access: access.allowed ? { allowed: true as const } : { allowed: false as const, message: access.message },
        accessExpiresAt: fromDbDate(enrollment.accessExpiresAt),
        money: { ...summary, overdue: isOverdue(summary, due, today) },
        payments: enrollment.payments.map((payment) => ({
          id: payment.id,
          kind: payment.kind,
          amount: payment.amount,
          currency: payment.currency,
          date: fromDbDate(payment.transactionDate),
          status: payment.status,
          method: payment.method
        }))
      };
    })
  );
  return {
    current: views.filter((view) => view.status === "ACTIVE"),
    history: views.filter((view) => view.status !== "ACTIVE")
  };
}
