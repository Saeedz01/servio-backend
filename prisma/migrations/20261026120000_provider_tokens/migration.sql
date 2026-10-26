-- CreateEnum
CREATE TYPE "TokenLedgerType" AS ENUM ('GRANT_MONTHLY', 'SPEND_UNLOCK');

-- CreateEnum
CREATE TYPE "ContactUnlockTargetType" AS ENUM ('BOOKING', 'JOB');

-- CreateTable
CREATE TABLE "provider_token_wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_token_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_token_ledgers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_id" UUID NOT NULL,
    "type" "TokenLedgerType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "month_key" TEXT,
    "ref_type" "ContactUnlockTargetType",
    "ref_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_token_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_unlocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_id" UUID NOT NULL,
    "target_type" "ContactUnlockTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_token_wallets_provider_id_key" ON "provider_token_wallets"("provider_id");

-- CreateIndex
CREATE INDEX "provider_token_ledgers_provider_id_idx" ON "provider_token_ledgers"("provider_id");

-- CreateIndex
CREATE INDEX "provider_token_ledgers_provider_id_type_month_key_idx" ON "provider_token_ledgers"("provider_id", "type", "month_key");

-- CreateIndex
CREATE INDEX "contact_unlocks_provider_id_idx" ON "contact_unlocks"("provider_id");

-- CreateIndex
CREATE INDEX "contact_unlocks_target_type_target_id_idx" ON "contact_unlocks"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_unlocks_provider_id_target_type_target_id_key" ON "contact_unlocks"("provider_id", "target_type", "target_id");

-- AddForeignKey
ALTER TABLE "provider_token_wallets" ADD CONSTRAINT "provider_token_wallets_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_token_ledgers" ADD CONSTRAINT "provider_token_ledgers_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_unlocks" ADD CONSTRAINT "contact_unlocks_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
