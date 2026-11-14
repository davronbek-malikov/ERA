-- Weekly homework rule (additive only).
ALTER TABLE "Instructor" ADD COLUMN "homework_rule_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Instructor" ADD COLUMN "homework_per_week" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "homework_reviews" ADD COLUMN "submitted_at" TIMESTAMP(3);

-- Existing handed-in homework: best known date is when it was checked, else when the row last changed.
UPDATE "homework_reviews" SET "submitted_at" = COALESCE("checked_at", "updated_at") WHERE "status" <> 'NOT_SUBMITTED';
