-- Telephony parity (meld doc 12 → parity). Additive. Hand-written (migrate deploy)
-- so the raw partial unique indexes elsewhere are untouched.

-- 1. Distinguish a carrier 'undelivered' from a hard 'failed' on blast recipients.
--    (TxSmsStatus already carries UNDELIVERED; this brings the marketing enum level.)
ALTER TYPE "messaging"."BlastRecipientStatus" ADD VALUE IF NOT EXISTS 'UNDELIVERED';

-- 2. Richer transactional templates (mirrors prog: type/category/variables/fromNumber).
ALTER TABLE "messaging"."MessageTemplate" ADD COLUMN "type" TEXT;
ALTER TABLE "messaging"."MessageTemplate" ADD COLUMN "category" TEXT;
ALTER TABLE "messaging"."MessageTemplate" ADD COLUMN "variables" JSONB;
ALTER TABLE "messaging"."MessageTemplate" ADD COLUMN "fromNumber" TEXT;
