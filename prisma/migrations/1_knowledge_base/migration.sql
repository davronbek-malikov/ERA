-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "KnowledgeScope" AS ENUM ('PLATFORM', 'COURSE', 'LESSON', 'TEACHER_PRIVATE');

-- CreateEnum
CREATE TYPE "KnowledgeVisibility" AS ENUM ('STUDENTS', 'TEACHERS_ONLY');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "sources" JSONB;

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "scope" "KnowledgeScope" NOT NULL,
    "visibility" "KnowledgeVisibility" NOT NULL DEFAULT 'STUDENTS',
    "course_id" TEXT,
    "lesson_id" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'PENDING',
    "error_code" TEXT,
    "error_message" TEXT,
    "page_count" INTEGER,
    "section_count" INTEGER,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "embedding_model" TEXT,
    "embedding_dimensions" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processing_started_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "heading" TEXT,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "char_count" INTEGER NOT NULL,
    "embedding_model" TEXT NOT NULL,
    "embedding" vector,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_documents_scope_course_id_idx" ON "knowledge_documents"("scope", "course_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_lesson_id_idx" ON "knowledge_documents"("lesson_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_uploaded_by_id_idx" ON "knowledge_documents"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_content_hash_idx" ON "knowledge_documents"("content_hash");

-- CreateIndex
CREATE INDEX "knowledge_chunks_embedding_model_idx" ON "knowledge_chunks"("embedding_model");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunks_document_id_chunk_index_key" ON "knowledge_chunks"("document_id", "chunk_index");

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

