-- CreateTable
CREATE TABLE "bidding" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bidding_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "bidding_job_id_idx" ON "bidding"("job_id");
CREATE INDEX "bidding_provider_id_idx" ON "bidding"("provider_id");

-- One bid per provider per job
CREATE UNIQUE INDEX "bidding_job_id_provider_id_key" ON "bidding"("job_id", "provider_id");

-- ForeignKeys
ALTER TABLE "bidding" ADD CONSTRAINT "bidding_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bidding" ADD CONSTRAINT "bidding_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
