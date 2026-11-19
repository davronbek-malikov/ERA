-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegram_chat_id" TEXT,
ADD COLUMN     "telegram_linked_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "telegram_messages" (
    "id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "text" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "student_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "schedule" TEXT NOT NULL,
    "send_at" TIMESTAMP(3),
    "weekday" INTEGER,
    "time_of_day" TEXT,
    "next_run_at" TIMESTAMP(3),
    "last_run_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_deliveries" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "run_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telegram_messages_active_next_run_at_idx" ON "telegram_messages"("active", "next_run_at");

-- CreateIndex
CREATE INDEX "telegram_messages_instructor_id_created_at_idx" ON "telegram_messages"("instructor_id", "created_at");

-- CreateIndex
CREATE INDEX "telegram_deliveries_student_id_created_at_idx" ON "telegram_deliveries"("student_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_deliveries_message_id_student_id_run_key_key" ON "telegram_deliveries"("message_id", "student_id", "run_key");

-- AddForeignKey
ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "Instructor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_deliveries" ADD CONSTRAINT "telegram_deliveries_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "telegram_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_deliveries" ADD CONSTRAINT "telegram_deliveries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Defence in depth, like every other table (see 3_row_level_security).
ALTER TABLE "telegram_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "telegram_deliveries" ENABLE ROW LEVEL SECURITY;
