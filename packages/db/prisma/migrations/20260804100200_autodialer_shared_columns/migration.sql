-- Shared-model additions for the autodialer + actions domains. Additive only.
-- NOTE: the enum values added here are deliberately NOT consumed by any row
-- write in this migration — Postgres forbids using a value added by ALTER TYPE
-- inside the same transaction.

-- Voice consent channel: dial-time opt-out exclusion + the IVR `*` write-back.
ALTER TYPE "messaging"."MessageChannel" ADD VALUE IF NOT EXISTS 'VOICE';

-- Robo-poll answers written back as canvass dispositions carry channel PHONE.
ALTER TYPE "canvass"."EngagementChannel" ADD VALUE IF NOT EXISTS 'PHONE';

-- Generic AMD verdict on the shared call ledger (Twilio AnsweredBy).
ALTER TABLE "telephony"."Call" ADD COLUMN "answeredBy" TEXT;
ALTER TABLE "telephony"."Call" ADD COLUMN "machineDetected" BOOLEAN;

-- The autodialer's own TwiML app per platform voice account (voiceUrl →
-- /autodialer/ivr/answer) — anonymous widget traffic never rides the softphone app.
ALTER TABLE "telephony"."PlatformVoiceApp" ADD COLUMN "dialerTwimlAppSid" TEXT;

-- Electorate-office phone for electoral targeting (populated by the civic
-- phone backfill or curated manually; syncs don't carry it).
ALTER TABLE "civic"."Politician" ADD COLUMN "phone" TEXT;
ALTER TABLE "civic"."Politician" ADD COLUMN "phoneSource" TEXT;
