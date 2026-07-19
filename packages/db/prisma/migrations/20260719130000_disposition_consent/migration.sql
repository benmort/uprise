-- Consent capture for canvass dispositions. Recorded support levels are sensitive
-- information (political opinions) under Privacy Act APP 3, so holding them beyond
-- the campaign needs affirmative, evidenced consent (APP 5 notice; APP 11.2
-- retention). consentMethod: "verbal_door" | "form" | "digital". Additive only.

ALTER TABLE "canvass"."Disposition" ADD COLUMN IF NOT EXISTS "consentAt" TIMESTAMP(3);
ALTER TABLE "canvass"."Disposition" ADD COLUMN IF NOT EXISTS "consentMethod" TEXT;

-- Rolled-up latest consent on the contact spine (latest wins) — drives the
-- `contact.consented` segment leaf for the lawful cross-campaign supporter file.
ALTER TABLE "public"."Contact" ADD COLUMN IF NOT EXISTS "consentAt" TIMESTAMP(3);
ALTER TABLE "public"."Contact" ADD COLUMN IF NOT EXISTS "consentMethod" TEXT;
