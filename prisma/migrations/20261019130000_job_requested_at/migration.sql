-- AlterTable: when the seeker needs the job done
ALTER TABLE "jobs" ADD COLUMN "requested_at" TIMESTAMP(3);

-- Backfill existing rows (default to one day after post)
UPDATE "jobs"
SET "requested_at" = "created_at" + INTERVAL '1 day'
WHERE "requested_at" IS NULL;

ALTER TABLE "jobs" ALTER COLUMN "requested_at" SET NOT NULL;
