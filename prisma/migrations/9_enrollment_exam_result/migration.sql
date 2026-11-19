-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "exam_result" TEXT,
ADD COLUMN     "exam_result_at" TIMESTAMP(3),
ADD COLUMN     "exam_result_by_id" TEXT;

