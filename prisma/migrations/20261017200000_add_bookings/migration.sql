-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'NEGOTIATING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "seeker_id" UUID,
    "guest_name" TEXT,
    "guest_phone" TEXT,
    "service_title" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- Hybrid requester: logged-in seeker XOR guest contact
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_requester_check" CHECK (
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
CREATE INDEX "bookings_provider_id_idx" ON "bookings"("provider_id");
CREATE INDEX "bookings_seeker_id_idx" ON "bookings"("seeker_id");
CREATE INDEX "bookings_guest_phone_idx" ON "bookings"("guest_phone");
CREATE INDEX "bookings_status_idx" ON "bookings"("status");
CREATE INDEX "bookings_service_id_idx" ON "bookings"("service_id");

-- ForeignKeys
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_seeker_id_fkey"
  FOREIGN KEY ("seeker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
