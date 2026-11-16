-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegram_chat_id" TEXT,
ADD COLUMN     "telegram_linked_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Instructor" ADD COLUMN     "reminder_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminder_text" TEXT;

-- CreateTable
CREATE TABLE "homework_reminders" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "instructor_id" TEXT,
    "week_from" DATE NOT NULL,
    "week_number" INTEGER NOT NULL,
    "handed_in" INTEGER NOT NULL,
    "required" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "source" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homework_reminders_instructor_id_created_at_idx" ON "homework_reminders"("instructor_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "homework_reminders_enrollment_id_week_from_key" ON "homework_reminders"("enrollment_id", "week_from");

-- AddForeignKey
ALTER TABLE "homework_reminders" ADD CONSTRAINT "homework_reminders_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_reminders" ADD CONSTRAINT "homework_reminders_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_reminders" ADD CONSTRAINT "homework_reminders_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "Instructor"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Defence in depth for Supabase's public API (see 3_row_level_security): the app connects as the owner.
ALTER TABLE "homework_reminders" ENABLE ROW LEVEL SECURITY;
