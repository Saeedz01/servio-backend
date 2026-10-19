-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('OPEN', 'AWARDED', 'CLOSED');

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "seeker_id" UUID,
    "guest_name" TEXT,
    "guest_phone" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- Hybrid requester: logged-in seeker XOR guest contact
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_requester_check" CHECK (
  (
    "seeker_id" IS NOT NULL
    AND "guest_name" IS NULL
    AND "guest_phone" IS NULL
  )
  OR (
    "seeker_id" IS NULL
    AND "guest_name" IS NOT NULL
    AND "guest_phone" IS NOT NULL
  )
);

-- Indexes
CREATE INDEX "jobs_category_id_idx" ON "jobs"("category_id");
CREATE INDEX "jobs_seeker_id_idx" ON "jobs"("seeker_id");
CREATE INDEX "jobs_guest_phone_idx" ON "jobs"("guest_phone");
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- ForeignKeys
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "jobs" ADD CONSTRAINT "jobs_seeker_id_fkey"
  FOREIGN KEY ("seeker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
