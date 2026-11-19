-- AlterTable
ALTER TABLE "telegram_messages" ADD COLUMN     "pacing" TEXT NOT NULL DEFAULT 'FAST',
ADD COLUMN     "window_end" TEXT NOT NULL DEFAULT '17:00',
ADD COLUMN     "window_start" TEXT NOT NULL DEFAULT '08:00';

-- AlterTable
ALTER TABLE "telegram_deliveries" ADD COLUMN     "scheduled_for" TIMESTAMP(3),
ADD COLUMN     "via" TEXT;

-- CreateTable
CREATE TABLE "telegram_accounts" (
    "instructor_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "session_enc" TEXT,
    "phone_code_hash" TEXT,
    "telegram_user_id" TEXT,
    "display_name" TEXT,
    "username" TEXT,
    "limited_until" TIMESTAMP(3),
    "last_sent_at" TIMESTAMP(3),
    "last_error" TEXT,
    "connected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_accounts_pkey" PRIMARY KEY ("instructor_id")
);

-- CreateIndex
CREATE INDEX "telegram_deliveries_status_scheduled_for_idx" ON "telegram_deliveries"("status", "scheduled_for");

-- AddForeignKey
ALTER TABLE "telegram_accounts" ADD CONSTRAINT "telegram_accounts_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "Instructor"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Defence in depth, like every other table (see 3_row_level_security).
ALTER TABLE "telegram_accounts" ENABLE ROW LEVEL SECURITY;
