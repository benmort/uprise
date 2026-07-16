-- Blast from-number selection: a tenant can pick which provisioned number a blast
-- sends from, and label its provisioned numbers with a human nickname.
-- Additive only. Schema-qualified (uprise is multi-schema). id-only cross-schema
-- ref: Blast.fromNumberId points at TelephonyPhoneNumber.id with no FK (messaging →
-- telephony crosses schemas — resolved at send time, degrades to the default sender).

-- Human label for a provisioned number, shown in the from-number selector.
ALTER TABLE "telephony"."TelephonyPhoneNumber" ADD COLUMN "nickname" TEXT;

-- Explicit send-from number for a blast (null ⇒ the tenant's default sender / env).
ALTER TABLE "messaging"."Blast" ADD COLUMN "fromNumberId" TEXT;
