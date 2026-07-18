-- Telephony: the number type a provisioning run purchases (additive; migrate deploy).
-- "mobile" = AU mobile (SMS-capable, the historical behaviour); "local" = AU local
-- (voice caller-id capable). Existing runs keep "mobile".
ALTER TABLE "telephony"."TelephonyProvisioningRun"
  ADD COLUMN IF NOT EXISTS "numberType" TEXT NOT NULL DEFAULT 'mobile';
