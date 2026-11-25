-- Study room selection toolbar: a student's private highlights and notes on a lesson's study guide.
-- CreateTable
CREATE TABLE "study_annotations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "start" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'yellow',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_annotations_user_id_lesson_id_idx" ON "study_annotations"("user_id", "lesson_id");

-- AddForeignKey
ALTER TABLE "study_annotations" ADD CONSTRAINT "study_annotations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_annotations" ADD CONSTRAINT "study_annotations_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row Level Security: like every ERA table, only the server (which bypasses RLS) reads this table.
ALTER TABLE "study_annotations" ENABLE ROW LEVEL SECURITY;
