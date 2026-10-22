-- AlterEnum
ALTER TYPE "MessageSenderRole" ADD VALUE 'ADMIN';

-- AlterTable: seeker optional; admin participant for moderation chats
ALTER TABLE "message_threads" ALTER COLUMN "seeker_id" DROP NOT NULL;

ALTER TABLE "message_threads" ADD COLUMN "admin_id" UUID;

-- CreateIndex
CREATE INDEX "message_threads_admin_id_idx" ON "message_threads"("admin_id");

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
