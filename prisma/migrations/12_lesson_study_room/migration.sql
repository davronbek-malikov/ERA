-- Lesson study room (docs/ERA_STUDY_ROOM.md): uploaded lesson materials, AI-written study guides reviewed by the
-- teacher, students' answers in Test yourself, and a cache of answered questions (saves AI tokens).
-- CreateEnum
CREATE TYPE "StudyGuideStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "lesson_study_materials" (
    "id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "page_count" INTEGER,
    "text" TEXT NOT NULL,
    "char_count" INTEGER NOT NULL,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_study_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_study_guides" (
    "id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "status" "StudyGuideStatus" NOT NULL DEFAULT 'DRAFT',
    "content_uz" JSONB,
    "content_en" JSONB,
    "generated_with" TEXT,
    "generated_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "published_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_study_guides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "correct" BOOLEAN,
    "score" INTEGER,
    "feedback" TEXT,
    "follow_up" TEXT,
    "language" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_ask_cache" (
    "id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "question_key" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sources" JSONB,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_ask_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_study_materials_lesson_id_idx" ON "lesson_study_materials"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_study_guides_lesson_id_key" ON "lesson_study_guides"("lesson_id");

-- CreateIndex
CREATE INDEX "study_attempts_lesson_id_user_id_idx" ON "study_attempts"("lesson_id", "user_id");

-- CreateIndex
CREATE INDEX "study_attempts_user_id_created_at_idx" ON "study_attempts"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "study_ask_cache_lesson_id_language_question_key_key" ON "study_ask_cache"("lesson_id", "language", "question_key");

-- AddForeignKey
ALTER TABLE "lesson_study_materials" ADD CONSTRAINT "lesson_study_materials_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_study_guides" ADD CONSTRAINT "lesson_study_guides_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_attempts" ADD CONSTRAINT "study_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_attempts" ADD CONSTRAINT "study_attempts_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_ask_cache" ADD CONSTRAINT "study_ask_cache_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row Level Security: like every ERA table, only the server (which bypasses RLS) reads these tables.
ALTER TABLE "lesson_study_materials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lesson_study_guides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "study_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "study_ask_cache" ENABLE ROW LEVEL SECURITY;
