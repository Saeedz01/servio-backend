-- Migrate all primary/foreign keys from cuid/slug TEXT ids to UUIDs.
-- Preserves row data and referential integrity.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop foreign keys so ids can be rewritten
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_id_fkey";
ALTER TABLE "admins" DROP CONSTRAINT IF EXISTS "admins_user_id_fkey";
ALTER TABLE "seekers" DROP CONSTRAINT IF EXISTS "seekers_user_id_fkey";
ALTER TABLE "providers" DROP CONSTRAINT IF EXISTS "providers_user_id_fkey";
ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_provider_id_fkey";

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------
ALTER TABLE "roles" ADD COLUMN "new_id" UUID NOT NULL DEFAULT gen_random_uuid();

CREATE TEMP TABLE "_role_id_map" AS
SELECT "id" AS old_id, "new_id" FROM "roles";

ALTER TABLE "users" ADD COLUMN "new_role_id" UUID;

UPDATE "users" u
SET "new_role_id" = m."new_id"
FROM "_role_id_map" m
WHERE u."role_id" = m.old_id;

ALTER TABLE "roles" DROP CONSTRAINT "roles_pkey";
ALTER TABLE "roles" DROP COLUMN "id";
ALTER TABLE "roles" RENAME COLUMN "new_id" TO "id";
ALTER TABLE "roles" ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");
ALTER TABLE "roles" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "users" DROP COLUMN "role_id";
ALTER TABLE "users" RENAME COLUMN "new_role_id" TO "role_id";
ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN "new_id" UUID NOT NULL DEFAULT gen_random_uuid();

CREATE TEMP TABLE "_user_id_map" AS
SELECT "id" AS old_id, "new_id" FROM "users";

ALTER TABLE "admins" ADD COLUMN "new_user_id" UUID;
ALTER TABLE "seekers" ADD COLUMN "new_user_id" UUID;
ALTER TABLE "providers" ADD COLUMN "new_user_id" UUID;

UPDATE "admins" a
SET "new_user_id" = m."new_id"
FROM "_user_id_map" m
WHERE a."user_id" = m.old_id;

UPDATE "seekers" s
SET "new_user_id" = m."new_id"
FROM "_user_id_map" m
WHERE s."user_id" = m.old_id;

UPDATE "providers" p
SET "new_user_id" = m."new_id"
FROM "_user_id_map" m
WHERE p."user_id" = m.old_id;

ALTER TABLE "users" DROP CONSTRAINT "users_pkey";
ALTER TABLE "users" DROP COLUMN "id";
ALTER TABLE "users" RENAME COLUMN "new_id" TO "id";
ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "admins" DROP COLUMN "user_id";
ALTER TABLE "admins" RENAME COLUMN "new_user_id" TO "user_id";
ALTER TABLE "admins" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "seekers" DROP COLUMN "user_id";
ALTER TABLE "seekers" RENAME COLUMN "new_user_id" TO "user_id";
ALTER TABLE "seekers" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "providers" DROP COLUMN "user_id";
ALTER TABLE "providers" RENAME COLUMN "new_user_id" TO "user_id";
ALTER TABLE "providers" ALTER COLUMN "user_id" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- admins / seekers / providers (profile PKs)
-- ---------------------------------------------------------------------------
ALTER TABLE "admins" ADD COLUMN "new_id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "admins" DROP CONSTRAINT "admins_pkey";
ALTER TABLE "admins" DROP COLUMN "id";
ALTER TABLE "admins" RENAME COLUMN "new_id" TO "id";
ALTER TABLE "admins" ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("id");
ALTER TABLE "admins" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "seekers" ADD COLUMN "new_id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "seekers" DROP CONSTRAINT "seekers_pkey";
ALTER TABLE "seekers" DROP COLUMN "id";
ALTER TABLE "seekers" RENAME COLUMN "new_id" TO "id";
ALTER TABLE "seekers" ADD CONSTRAINT "seekers_pkey" PRIMARY KEY ("id");
ALTER TABLE "seekers" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "providers" ADD COLUMN "new_id" UUID NOT NULL DEFAULT gen_random_uuid();

CREATE TEMP TABLE "_provider_id_map" AS
SELECT "id" AS old_id, "new_id" FROM "providers";

ALTER TABLE "services" ADD COLUMN "new_provider_id" UUID;

UPDATE "services" s
SET "new_provider_id" = m."new_id"
FROM "_provider_id_map" m
WHERE s."provider_id" = m.old_id;

ALTER TABLE "providers" DROP CONSTRAINT "providers_pkey";
ALTER TABLE "providers" DROP COLUMN "id";
ALTER TABLE "providers" RENAME COLUMN "new_id" TO "id";
ALTER TABLE "providers" ADD CONSTRAINT "providers_pkey" PRIMARY KEY ("id");
ALTER TABLE "providers" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "services" DROP COLUMN "provider_id";
ALTER TABLE "services" RENAME COLUMN "new_provider_id" TO "provider_id";
ALTER TABLE "services" ALTER COLUMN "provider_id" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------
ALTER TABLE "services" ADD COLUMN "new_id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "services" DROP CONSTRAINT "services_pkey";
ALTER TABLE "services" DROP COLUMN "id";
ALTER TABLE "services" RENAME COLUMN "new_id" TO "id";
ALTER TABLE "services" ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");
ALTER TABLE "services" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- ---------------------------------------------------------------------------
-- Recreate indexes + foreign keys
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "users_role_id_idx";
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

DROP INDEX IF EXISTS "admins_user_id_key";
CREATE UNIQUE INDEX "admins_user_id_key" ON "admins"("user_id");

DROP INDEX IF EXISTS "seekers_user_id_key";
CREATE UNIQUE INDEX "seekers_user_id_key" ON "seekers"("user_id");

DROP INDEX IF EXISTS "providers_user_id_key";
CREATE UNIQUE INDEX "providers_user_id_key" ON "providers"("user_id");

DROP INDEX IF EXISTS "services_provider_id_idx";
CREATE INDEX "services_provider_id_idx" ON "services"("provider_id");

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
