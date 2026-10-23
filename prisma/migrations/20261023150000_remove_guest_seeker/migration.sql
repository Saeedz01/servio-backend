-- Drop guest-only bookings/jobs (no seeker account)
DELETE FROM "bidding"
WHERE "job_id" IN (SELECT "id" FROM "jobs" WHERE "seeker_id" IS NULL);

DELETE FROM "jobs" WHERE "seeker_id" IS NULL;

DELETE FROM "bookings" WHERE "seeker_id" IS NULL;

-- Booking: drop guest columns; require seeker
DROP INDEX IF EXISTS "bookings_guest_phone_idx";

ALTER TABLE "bookings" DROP COLUMN IF EXISTS "guest_name";
ALTER TABLE "bookings" DROP COLUMN IF EXISTS "guest_phone";

ALTER TABLE "bookings" ALTER COLUMN "seeker_id" SET NOT NULL;

ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_seeker_id_fkey";
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_seeker_id_fkey"
  FOREIGN KEY ("seeker_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Job: drop guest columns; require seeker
DROP INDEX IF EXISTS "jobs_guest_phone_idx";

ALTER TABLE "jobs" DROP COLUMN IF EXISTS "guest_name";
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "guest_phone";

ALTER TABLE "jobs" ALTER COLUMN "seeker_id" SET NOT NULL;

ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_seeker_id_fkey";
ALTER TABLE "jobs"
  ADD CONSTRAINT "jobs_seeker_id_fkey"
  FOREIGN KEY ("seeker_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
