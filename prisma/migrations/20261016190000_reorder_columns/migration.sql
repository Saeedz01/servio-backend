-- Reorder physical PostgreSQL columns so each table is:
--   id, ...business columns..., created_at, updated_at
-- Prisma schema field order does not control PG attnum; recreate tables.

-- Drop foreign keys first
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_id_fkey";
ALTER TABLE "admins" DROP CONSTRAINT IF EXISTS "admins_user_id_fkey";
ALTER TABLE "seekers" DROP CONSTRAINT IF EXISTS "seekers_user_id_fkey";
ALTER TABLE "providers" DROP CONSTRAINT IF EXISTS "providers_user_id_fkey";
ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_provider_id_fkey";

-- ---------------------------------------------------------------------------
-- roles: id, role_name, status, created_at, updated_at
-- ---------------------------------------------------------------------------
CREATE TABLE "roles_new" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_name" TEXT NOT NULL,
    "status" "RoleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "roles_new_pkey" PRIMARY KEY ("id")
);

INSERT INTO "roles_new" ("id", "role_name", "status", "created_at", "updated_at")
SELECT "id"::uuid, "role_name", "status", "created_at", "updated_at" FROM "roles";

DROP TABLE "roles";
ALTER TABLE "roles_new" RENAME TO "roles";
CREATE UNIQUE INDEX "roles_role_name_key" ON "roles"("role_name");

-- ---------------------------------------------------------------------------
-- users: id, name, password, role_id, status, created_at, updated_at
-- ---------------------------------------------------------------------------
CREATE TABLE "users_new" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_new_pkey" PRIMARY KEY ("id")
);

INSERT INTO "users_new" ("id", "name", "password", "role_id", "status", "created_at", "updated_at")
SELECT "id"::uuid, "name", "password", "role_id"::uuid, "status", "created_at", "updated_at" FROM "users";

DROP TABLE "users";
ALTER TABLE "users_new" RENAME TO "users";
CREATE INDEX "users_role_id_idx" ON "users"("role_id");
CREATE INDEX "users_status_idx" ON "users"("status");

-- ---------------------------------------------------------------------------
-- admins: id, user_id, email, created_at, updated_at
-- ---------------------------------------------------------------------------
CREATE TABLE "admins_new" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admins_new_pkey" PRIMARY KEY ("id")
);

INSERT INTO "admins_new" ("id", "user_id", "email", "created_at", "updated_at")
SELECT "id"::uuid, "user_id"::uuid, "email", "created_at", "updated_at" FROM "admins";

DROP TABLE "admins";
ALTER TABLE "admins_new" RENAME TO "admins";
CREATE UNIQUE INDEX "admins_user_id_key" ON "admins"("user_id");
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- ---------------------------------------------------------------------------
-- seekers: id, user_id, email, created_at, updated_at
-- ---------------------------------------------------------------------------
CREATE TABLE "seekers_new" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "seekers_new_pkey" PRIMARY KEY ("id")
);

INSERT INTO "seekers_new" ("id", "user_id", "email", "created_at", "updated_at")
SELECT "id"::uuid, "user_id"::uuid, "email", "created_at", "updated_at" FROM "seekers";

DROP TABLE "seekers";
ALTER TABLE "seekers_new" RENAME TO "seekers";
CREATE UNIQUE INDEX "seekers_user_id_key" ON "seekers"("user_id");
CREATE UNIQUE INDEX "seekers_email_key" ON "seekers"("email");

-- ---------------------------------------------------------------------------
-- providers: id, user_id, phone, id_card_front, id_card_back, created_at, updated_at
-- ---------------------------------------------------------------------------
CREATE TABLE "providers_new" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "id_card_front" TEXT NOT NULL,
    "id_card_back" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "providers_new_pkey" PRIMARY KEY ("id")
);

INSERT INTO "providers_new" ("id", "user_id", "phone", "id_card_front", "id_card_back", "created_at", "updated_at")
SELECT "id"::uuid, "user_id"::uuid, "phone", "id_card_front", "id_card_back", "created_at", "updated_at" FROM "providers";

DROP TABLE "providers";
ALTER TABLE "providers_new" RENAME TO "providers";
CREATE UNIQUE INDEX "providers_user_id_key" ON "providers"("user_id");
CREATE UNIQUE INDEX "providers_phone_key" ON "providers"("phone");

-- ---------------------------------------------------------------------------
-- services: id, provider_id, ..., status, created_at, updated_at
-- ---------------------------------------------------------------------------
CREATE TABLE "services_new" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_id" UUID NOT NULL,
    "category_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radius_km" DOUBLE PRECISION NOT NULL,
    "price_amount" DOUBLE PRECISION NOT NULL,
    "price_unit" "PriceUnit" NOT NULL,
    "availability" JSONB NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "services_new_pkey" PRIMARY KEY ("id")
);

INSERT INTO "services_new" (
    "id", "provider_id", "category_id", "title", "description", "image_url",
    "address", "lat", "lng", "radius_km", "price_amount", "price_unit",
    "availability", "status", "created_at", "updated_at"
)
SELECT
    "id"::uuid, "provider_id"::uuid, "category_id", "title", "description", "image_url",
    "address", "lat", "lng", "radius_km", "price_amount", "price_unit",
    "availability", "status", "created_at", "updated_at"
FROM "services";

DROP TABLE "services";
ALTER TABLE "services_new" RENAME TO "services";
CREATE INDEX "services_provider_id_idx" ON "services"("provider_id");
CREATE INDEX "services_status_idx" ON "services"("status");
CREATE INDEX "services_category_id_idx" ON "services"("category_id");

-- ---------------------------------------------------------------------------
-- Restore foreign keys
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admins" ADD CONSTRAINT "admins_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seekers" ADD CONSTRAINT "seekers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "providers" ADD CONSTRAINT "providers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "services" ADD CONSTRAINT "services_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
