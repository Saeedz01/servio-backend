-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RoleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "status" "RoleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_role_name_key" ON "roles"("role_name");

-- Seed roles (stable ids for migration joins)
INSERT INTO "roles" ("id", "role_name", "status", "created_at", "updated_at") VALUES
  ('role_admin', 'admin', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_seeker', 'seeker', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_provider', 'provider', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Create profile tables
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "seekers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seekers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "id_card_front" TEXT NOT NULL,
    "id_card_back" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- Add new columns on users (nullable until backfilled)
ALTER TABLE "users" ADD COLUMN "role_id" TEXT;
ALTER TABLE "users" ADD COLUMN "account_status" "AccountStatus";

-- Map old role enum → role_id
UPDATE "users" SET "role_id" = 'role_admin' WHERE "role" = 'ADMIN';
UPDATE "users" SET "role_id" = 'role_seeker' WHERE "role" = 'SEEKER';
UPDATE "users" SET "role_id" = 'role_provider' WHERE "role" = 'PROVIDER';

-- Map status: providers keep verification status; others become ACTIVE
UPDATE "users"
SET "account_status" = CASE
  WHEN "role" = 'PROVIDER' AND "status" = 'PENDING' THEN 'PENDING'::"AccountStatus"
  WHEN "role" = 'PROVIDER' AND "status" = 'VERIFIED' THEN 'VERIFIED'::"AccountStatus"
  WHEN "role" = 'PROVIDER' AND "status" = 'REJECTED' THEN 'REJECTED'::"AccountStatus"
  WHEN "role" = 'PROVIDER' THEN 'PENDING'::"AccountStatus"
  ELSE 'ACTIVE'::"AccountStatus"
END;

-- Migrate role profiles (preserve credentials + ids)
INSERT INTO "admins" ("id", "user_id", "email", "created_at", "updated_at")
SELECT
  'adm_' || "id",
  "id",
  "email",
  "createdAt",
  "updatedAt"
FROM "users"
WHERE "role" = 'ADMIN' AND "email" IS NOT NULL;

INSERT INTO "seekers" ("id", "user_id", "email", "created_at", "updated_at")
SELECT
  'sk_' || "id",
  "id",
  "email",
  "createdAt",
  "updatedAt"
FROM "users"
WHERE "role" = 'SEEKER' AND "email" IS NOT NULL;

INSERT INTO "providers" ("id", "user_id", "phone", "id_card_front", "id_card_back", "created_at", "updated_at")
SELECT
  'prv_' || "id",
  "id",
  "phone",
  COALESCE("idFrontUrl", ''),
  COALESCE("idBackUrl", ''),
  "createdAt",
  "updatedAt"
FROM "users"
WHERE "role" = 'PROVIDER' AND "phone" IS NOT NULL;

-- Drop old columns / indexes
DROP INDEX IF EXISTS "users_email_key";
DROP INDEX IF EXISTS "users_phone_key";
DROP INDEX IF EXISTS "users_role_idx";

ALTER TABLE "users" DROP COLUMN "email";
ALTER TABLE "users" DROP COLUMN "phone";
ALTER TABLE "users" DROP COLUMN "role";
ALTER TABLE "users" DROP COLUMN "status";
ALTER TABLE "users" DROP COLUMN "idFrontUrl";
ALTER TABLE "users" DROP COLUMN "idBackUrl";

-- Rename account_status → status and enforce NOT NULL
ALTER TABLE "users" RENAME COLUMN "account_status" TO "status";
ALTER TABLE "users" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"AccountStatus";
ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL;

-- Rename camelCase timestamps on users to snake_case
ALTER TABLE "users" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "users" RENAME COLUMN "updatedAt" TO "updated_at";

-- Foreign keys + unique constraints
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "users_role_id_idx" ON "users"("role_id");
CREATE INDEX "users_status_idx" ON "users"("status");

CREATE UNIQUE INDEX "admins_user_id_key" ON "admins"("user_id");
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");
ALTER TABLE "admins" ADD CONSTRAINT "admins_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "seekers_user_id_key" ON "seekers"("user_id");
CREATE UNIQUE INDEX "seekers_email_key" ON "seekers"("email");
ALTER TABLE "seekers" ADD CONSTRAINT "seekers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "providers_user_id_key" ON "providers"("user_id");
CREATE UNIQUE INDEX "providers_phone_key" ON "providers"("phone");
ALTER TABLE "providers" ADD CONSTRAINT "providers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop obsolete enums
DROP TYPE "Role";
DROP TYPE "ProviderStatus";
