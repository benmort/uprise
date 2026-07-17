-- Event RSVP extras (additive; applied with `prisma migrate deploy`).
--
-- Adds: `guests` (party size beyond the registrant — capacity/waitlist count heads),
-- `manageToken` (long-lived, non-consuming attendee self-manage link — unique),
-- `checkedInAt` (door check-in timestamp, set alongside status→ATTENDED), and
-- `reminderSentAt` (idempotency gate for the T-24h reminder sweep).

ALTER TABLE "events"."EventRsvp"
  ADD COLUMN IF NOT EXISTS "guests" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "manageToken" TEXT,
  ADD COLUMN IF NOT EXISTS "checkedInAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "EventRsvp_manageToken_key" ON "events"."EventRsvp"("manageToken");
