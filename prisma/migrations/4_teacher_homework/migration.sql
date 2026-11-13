-- CreateEnum
CREATE TYPE "HomeworkStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'NEEDS_WORK', 'DONE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "github_url" TEXT;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "homework" TEXT,
ADD COLUMN     "taught_summary" TEXT;

-- CreateTable
CREATE TABLE "homework_reviews" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "status" "HomeworkStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "github_url" TEXT,
    "note" TEXT,
    "checked_at" TIMESTAMP(3),
    "checked_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homework_reviews_lesson_id_status_idx" ON "homework_reviews"("lesson_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "homework_reviews_enrollment_id_lesson_id_key" ON "homework_reviews"("enrollment_id", "lesson_id");

-- AddForeignKey
ALTER TABLE "homework_reviews" ADD CONSTRAINT "homework_reviews_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_reviews" ADD CONSTRAINT "homework_reviews_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_reviews" ADD CONSTRAINT "homework_reviews_checked_by_id_fkey" FOREIGN KEY ("checked_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Defence in depth, like every other table (see 3_row_level_security).
ALTER TABLE "homework_reviews" ENABLE ROW LEVEL SECURITY;
