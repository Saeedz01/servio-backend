-- CreateEnum
CREATE TYPE "MessageSenderRole" AS ENUM ('SEEKER', 'PROVIDER');

-- CreateTable
CREATE TABLE "message_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID,
    "provider_id" UUID NOT NULL,
    "seeker_id" UUID NOT NULL,
    "service_id" UUID,
    "service_title" TEXT NOT NULL DEFAULT '',
    "last_message_at" TIMESTAMP(3),
    "last_message_preview" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" UUID NOT NULL,
    "sender_role" "MessageSenderRole" NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_read_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" UUID NOT NULL,
    "participant_role" "MessageSenderRole" NOT NULL,
    "participant_id" TEXT NOT NULL,
    "last_read_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_read_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_threads_booking_id_key" ON "message_threads"("booking_id");

-- CreateIndex
CREATE INDEX "message_threads_provider_id_idx" ON "message_threads"("provider_id");

-- CreateIndex
CREATE INDEX "message_threads_seeker_id_idx" ON "message_threads"("seeker_id");

-- CreateIndex
CREATE INDEX "message_threads_service_id_idx" ON "message_threads"("service_id");

-- CreateIndex
CREATE INDEX "message_threads_last_message_at_idx" ON "message_threads"("last_message_at");

-- CreateIndex
CREATE INDEX "messages_thread_id_idx" ON "messages"("thread_id");

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

-- CreateIndex
CREATE INDEX "message_read_states_thread_id_idx" ON "message_read_states"("thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_read_states_thread_id_participant_role_participant_id_key" ON "message_read_states"("thread_id", "participant_role", "participant_id");

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_seeker_id_fkey" FOREIGN KEY ("seeker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_read_states" ADD CONSTRAINT "message_read_states_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
