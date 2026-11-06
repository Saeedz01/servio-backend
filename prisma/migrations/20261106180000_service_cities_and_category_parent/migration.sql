-- CreateTable
CREATE TABLE "service_cities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_cities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_cities_name_key" ON "service_cities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "service_cities_slug_key" ON "service_cities"("slug");

-- Seed cities (stable UUIDs for backfill)
INSERT INTO "service_cities" ("id", "name", "slug", "is_active", "created_at", "updated_at")
VALUES
  ('11111111-1111-4111-8111-111111111101'::uuid, 'Depalpur', 'depalpur', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('11111111-1111-4111-8111-111111111102'::uuid, 'Okara', 'okara', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('11111111-1111-4111-8111-111111111103'::uuid, 'Hujra Shah Muqeem', 'hujra-shah-muqeem', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('11111111-1111-4111-8111-111111111104'::uuid, 'Lahore', 'lahore', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: category parent
ALTER TABLE "service_categories" ADD COLUMN "parent_id" UUID;

-- CreateIndex
CREATE INDEX "service_categories_parent_id_idx" ON "service_categories"("parent_id");

-- AddForeignKey
ALTER TABLE "service_categories"
  ADD CONSTRAINT "service_categories_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "service_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: services.city_id (nullable first for backfill)
ALTER TABLE "services" ADD COLUMN "city_id" UUID;

UPDATE "services"
SET "city_id" = '11111111-1111-4111-8111-111111111104'::uuid
WHERE "city_id" IS NULL;

ALTER TABLE "services" ALTER COLUMN "city_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "services_city_id_idx" ON "services"("city_id");

-- AddForeignKey
ALTER TABLE "services"
  ADD CONSTRAINT "services_city_id_fkey"
  FOREIGN KEY ("city_id") REFERENCES "service_cities"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
