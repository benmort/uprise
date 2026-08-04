-- Electoral routing holds the caller-entered postcode on the attempt row
-- (DialerCallSession already carries one) so the multi-electorate menu's
-- selection step can re-derive its options server-side — Gather action URLs
-- keep carrying ids only, never caller input.

ALTER TABLE "autodialer"."DialerAttempt" ADD COLUMN IF NOT EXISTS "postcode" TEXT;
