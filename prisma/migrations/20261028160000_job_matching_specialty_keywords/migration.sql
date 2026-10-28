-- AlterTable
ALTER TABLE "service_categories" ADD COLUMN "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "services" ADD COLUMN "specialty" TEXT;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "specialty" TEXT;
