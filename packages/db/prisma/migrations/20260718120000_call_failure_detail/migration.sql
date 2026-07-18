-- Call failure detail (additive; applied with `prisma migrate deploy`).
--
-- Captures WHY an outbound call ended in BUSY/NO_ANSWER/FAILED so the admin Calls page can
-- show an accurate reason instead of a bare status. Populated from the Twilio voice status
-- callback (ErrorCode / ErrorMessage / SipResponseCode); null while live or on success.
-- Mirrors the error columns already on "messaging"."BlastRecipient" / "OutboundMessage".

ALTER TABLE "telephony"."Call"
  ADD COLUMN IF NOT EXISTS "errorCode" TEXT,
  ADD COLUMN IF NOT EXISTS "errorMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "sipCode" TEXT;
