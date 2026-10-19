-- Create service_categories and wire services.category_id as a UUID FK.
-- Remaps existing legacy string category ids without dropping service rows.

CREATE TABLE "service_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_categories_name_key" ON "service_categories"("name");
CREATE UNIQUE INDEX "service_categories_slug_key" ON "service_categories"("slug");

-- Seed canonical categories (idempotent via unique slug / name)
INSERT INTO "service_categories" ("id", "name", "slug", "description", "is_active", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'Home Repair & Maintenance', 'home-repair-maintenance', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Electrical & Solar Services', 'electrical-solar-services', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Plumbing & Water Services', 'plumbing-water-services', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'AC & Appliance Repair', 'ac-appliance-repair', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Construction & Renovation', 'construction-renovation', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cleaning & Pest Control', 'cleaning-pest-control', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Beauty & Personal Care', 'beauty-personal-care', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Domestic Help & Care', 'domestic-help-care', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Transport & Driver Services', 'transport-driver-services', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Vehicle Rental & Booking', 'vehicle-rental-booking', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Equipment & Machinery Rental', 'equipment-machinery-rental', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Property & Space Rental', 'property-space-rental', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Event Equipment & Furniture Rental', 'event-equipment-furniture-rental', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Events, Catering & Decorations', 'events-catering-decorations', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Automotive Repair & Maintenance', 'automotive-repair-maintenance', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Moving & Packers', 'moving-packers', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Education & Tutoring', 'education-tutoring', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'IT & Digital Services', 'it-digital-services', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Business & Professional Services', 'business-professional-services', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Photography & Videography', 'photography-videography', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Gardening & Landscaping', 'gardening-landscaping', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Delivery & Courier Services', 'delivery-courier-services', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Health & Wellness', 'health-wellness', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Pet Care', 'pet-care', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Other Services', 'other-services', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Remap legacy string category_id → UUID via slug mapping
ALTER TABLE "services" ADD COLUMN "category_id_new" UUID;

UPDATE "services" s
SET "category_id_new" = c."id"
FROM "service_categories" c
WHERE c."slug" = CASE s."category_id"
  WHEN 'assembly' THEN 'home-repair-maintenance'
  WHEN 'cleaning' THEN 'cleaning-pest-control'
  WHEN 'moving' THEN 'moving-packers'
  WHEN 'outdoor' THEN 'gardening-landscaping'
  WHEN 'painting' THEN 'construction-renovation'
  WHEN 'repairs' THEN 'plumbing-water-services'
  WHEN 'trending' THEN 'events-catering-decorations'
  ELSE NULL
END;

-- Accept rows that already store a category UUID (re-run / mixed-state safety)
UPDATE "services" s
SET "category_id_new" = c."id"
FROM "service_categories" c
WHERE s."category_id_new" IS NULL
  AND s."category_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND c."id"::text = s."category_id";

-- Fallback: any still-unmapped rows → Other Services
UPDATE "services" s
SET "category_id_new" = c."id"
FROM "service_categories" c
WHERE s."category_id_new" IS NULL
  AND c."slug" = 'other-services';

ALTER TABLE "services" ALTER COLUMN "category_id_new" SET NOT NULL;

DROP INDEX IF EXISTS "services_category_id_idx";
ALTER TABLE "services" DROP COLUMN "category_id";
ALTER TABLE "services" RENAME COLUMN "category_id_new" TO "category_id";

CREATE INDEX "services_category_id_idx" ON "services"("category_id");

ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "service_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
