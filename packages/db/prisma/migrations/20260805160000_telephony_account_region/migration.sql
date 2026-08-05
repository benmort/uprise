-- Twilio home region + edge of a telephony account.
--
-- Most tenants get a subaccount under the platform master, which lives in the default
-- region; a BYO account can be regional (Common Threads runs in au1 / sydney) and must be
-- driven with those client options or its API calls route to the wrong region. Additive
-- and nullable: every existing row stays NULL, which is exactly today's behaviour.
ALTER TABLE "telephony"."TelephonyAccount" ADD COLUMN IF NOT EXISTS "region" TEXT;
ALTER TABLE "telephony"."TelephonyAccount" ADD COLUMN IF NOT EXISTS "edge" TEXT;
