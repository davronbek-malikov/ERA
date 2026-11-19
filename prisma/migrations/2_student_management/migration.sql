-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "EnrollmentAccessStatus" AS ENUM ('ACTIVE', 'RESTRICTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PaymentArrangement" AS ENUM ('PAY_IN_FULL', 'PARTIAL', 'PAY_LATER', 'WAIVED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'ONLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ManagementSource" AS ENUM ('MANUAL', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiActionStatus" AS ENUM ('PENDING', 'EXECUTING', 'EXECUTED', 'CANCELLED', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "access_expires_at" DATE,
ADD COLUMN     "access_granted_by_id" TEXT,
ADD COLUMN     "access_note" TEXT,
ADD COLUMN     "access_status" "EnrollmentAccessStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'KRW',
ADD COLUMN     "end_date" DATE,
ADD COLUMN     "instructor_id" TEXT,
ADD COLUMN     "internal_note" TEXT,
ADD COLUMN     "payment_arrangement" "PaymentArrangement",
ADD COLUMN     "payment_due_date" DATE,
ADD COLUMN     "price_amount" INTEGER,
ADD COLUMN     "restrict_when_overdue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "start_date" DATE,
ADD COLUMN     "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL DEFAULT 'PAYMENT',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "method" "PaymentMethod" NOT NULL,
    "transaction_date" DATE NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "description" TEXT,
    "source" "ManagementSource" NOT NULL DEFAULT 'MANUAL',
    "recorded_by_id" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "reversed_by_id" TEXT,
    "reversed_at" TIMESTAMP(3),
    "reversal_reason" TEXT,
    "correction_of_id" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_access_logs" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "previous_status" "EnrollmentAccessStatus",
    "new_status" "EnrollmentAccessStatus" NOT NULL,
    "previous_expires_at" DATE,
    "new_expires_at" DATE,
    "arrangement" "PaymentArrangement",
    "reason" TEXT,
    "source" "ManagementSource" NOT NULL DEFAULT 'MANUAL',
    "changed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_notes" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "enrollment_id" TEXT,
    "note" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_schedules" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "instructor_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "exam_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT,
    "status" "ExamStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_participants" (
    "exam_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,

    CONSTRAINT "exam_participants_pkey" PRIMARY KEY ("exam_id","enrollment_id")
);

-- CreateTable
CREATE TABLE "instructor_permissions" (
    "instructor_id" TEXT NOT NULL,
    "can_view_payments" BOOLEAN NOT NULL DEFAULT false,
    "can_record_payments" BOOLEAN NOT NULL DEFAULT false,
    "can_approve_payments" BOOLEAN NOT NULL DEFAULT false,
    "can_manage_enrollments" BOOLEAN NOT NULL DEFAULT false,
    "can_manage_access" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instructor_permissions_pkey" PRIMARY KEY ("instructor_id")
);

-- CreateTable
CREATE TABLE "management_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before_data" JSONB,
    "after_data" JSONB,
    "source" "ManagementSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "management_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_pending_actions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent" "AiAgent" NOT NULL,
    "conversation_id" TEXT,
    "message_id" TEXT,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "status" "AiActionStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_idempotency_key_key" ON "payment_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "payment_transactions_enrollment_id_status_idx" ON "payment_transactions"("enrollment_id", "status");

-- CreateIndex
CREATE INDEX "payment_transactions_status_transaction_date_idx" ON "payment_transactions"("status", "transaction_date");

-- CreateIndex
CREATE INDEX "payment_transactions_transaction_date_idx" ON "payment_transactions"("transaction_date");

-- CreateIndex
CREATE INDEX "enrollment_access_logs_enrollment_id_created_at_idx" ON "enrollment_access_logs"("enrollment_id", "created_at");

-- CreateIndex
CREATE INDEX "student_notes_student_id_created_at_idx" ON "student_notes"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "exam_schedules_exam_date_idx" ON "exam_schedules"("exam_date");

-- CreateIndex
CREATE INDEX "exam_schedules_course_id_exam_date_idx" ON "exam_schedules"("course_id", "exam_date");

-- CreateIndex
CREATE INDEX "exam_schedules_instructor_id_exam_date_idx" ON "exam_schedules"("instructor_id", "exam_date");

-- CreateIndex
CREATE INDEX "exam_participants_enrollment_id_idx" ON "exam_participants"("enrollment_id");

-- CreateIndex
CREATE INDEX "management_audit_logs_entity_type_entity_id_created_at_idx" ON "management_audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "management_audit_logs_actor_id_created_at_idx" ON "management_audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "management_audit_logs_created_at_idx" ON "management_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "ai_pending_actions_user_id_status_created_at_idx" ON "ai_pending_actions"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ai_pending_actions_conversation_id_created_at_idx" ON "ai_pending_actions"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "Enrollment_instructor_id_idx" ON "Enrollment"("instructor_id");

-- CreateIndex
CREATE INDEX "Enrollment_status_idx" ON "Enrollment"("status");

-- CreateIndex
CREATE INDEX "Enrollment_start_date_idx" ON "Enrollment"("start_date");

-- CreateIndex
CREATE INDEX "Enrollment_end_date_idx" ON "Enrollment"("end_date");

-- CreateIndex
CREATE INDEX "Enrollment_payment_due_date_idx" ON "Enrollment"("payment_due_date");

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "Instructor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_access_granted_by_id_fkey" FOREIGN KEY ("access_granted_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_correction_of_id_fkey" FOREIGN KEY ("correction_of_id") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_access_logs" ADD CONSTRAINT "enrollment_access_logs_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_access_logs" ADD CONSTRAINT "enrollment_access_logs_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "Instructor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_participants" ADD CONSTRAINT "exam_participants_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exam_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_participants" ADD CONSTRAINT "exam_participants_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_permissions" ADD CONSTRAINT "instructor_permissions_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "Instructor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_permissions" ADD CONSTRAINT "instructor_permissions_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "management_audit_logs" ADD CONSTRAINT "management_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_pending_actions" ADD CONSTRAINT "ai_pending_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_pending_actions" ADD CONSTRAINT "ai_pending_actions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_pending_actions" ADD CONSTRAINT "ai_pending_actions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill (data only, no schema change): every existing enrollment is assigned to its course's teacher.
UPDATE "Enrollment" e
SET "instructor_id" = c."instructorId"
FROM "Course" c
WHERE e."courseId" = c."id" AND e."instructor_id" IS NULL;
