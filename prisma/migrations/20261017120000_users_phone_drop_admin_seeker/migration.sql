-- Consolidate identity onto users.phone; drop admins/seekers; move provider phone to users.
-- Preserves existing user/provider/service rows.

-- 1) Add phone on users (nullable until backfilled)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- 2) Provider phones → users
UPDATE "users" u
SET "phone" = regexp_replace(p."phone", '\D', '', 'g')
FROM "providers" p
WHERE p."user_id" = u."id"
  AND (u."phone" IS NULL OR u."phone" = '');

-- 3) Admin / seeker had email only — assign stable phones (preserve accounts)
UPDATE "users" u
SET "phone" = '03011111111'
FROM "admins" a
WHERE a."user_id" = u."id"
  AND (u."phone" IS NULL OR u."phone" = '');

UPDATE "users" u
SET "phone" = '03022222222'
FROM "seekers" s
WHERE s."user_id" = u."id"
  AND (u."phone" IS NULL OR u."phone" = '');

-- Any remaining users without phone get a deterministic fallback from id
UPDATE "users"
SET "phone" = '09' || RIGHT(REPLACE("id"::text, '-', ''), 10)
WHERE "phone" IS NULL OR "phone" = '';

-- 4) Drop provider.phone (now on users)
DROP INDEX IF EXISTS "providers_phone_key";
ALTER TABLE "providers" DROP COLUMN IF EXISTS "phone";

-- 5) Drop profile tables (identity lives on users)
DROP TABLE IF EXISTS "admins";
DROP TABLE IF EXISTS "seekers";

-- 6) Rebuild users so columns are: id, name, phone, password, role_id, status, created_at, updated_at
--    Avoid "users_new_pkey" name clash with leftover PK name from prior reorder migration.
ALTER TABLE "providers" DROP CONSTRAINT IF EXISTS "providers_user_id_fkey";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_id_fkey";
DROP INDEX IF EXISTS "users_role_id_idx";
DROP INDEX IF EXISTS "users_status_idx";

ALTER TABLE "users" RENAME TO "users_old";
ALTER INDEX IF EXISTS "users_new_pkey" RENAME TO "users_old_pkey";
ALTER INDEX IF EXISTS "users_pkey" RENAME TO "users_old_pkey";

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

INSERT INTO "users" ("id", "name", "phone", "password", "role_id", "status", "created_at", "updated_at")
SELECT "id", "name", "phone", "password", "role_id", "status", "created_at", "updated_at"
FROM "users_old";

DROP TABLE "users_old";

CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE INDEX "users_role_id_idx" ON "users"("role_id");
CREATE INDEX "users_status_idx" ON "users"("status");

ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "providers" ADD CONSTRAINT "providers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
