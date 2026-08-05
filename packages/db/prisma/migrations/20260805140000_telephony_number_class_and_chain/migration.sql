-- Telephony: persist a number's regulation class, and record whether a run should
-- chain the complementary class. Additive only.

-- The regulation class a number was provisioned under. Bundle reuse previously
-- inferred this from the "+614" prefix; a stored class is authoritative, a prefix
-- is a guess (AU mobiles are +614, locals +612/3/7/8).
ALTER TABLE "telephony"."TelephonyPhoneNumber"
  ADD COLUMN "numberType" TEXT NOT NULL DEFAULT 'mobile';

-- Back-fill pre-column rows from that same prefix heuristic, so the default of
-- 'mobile' never mislabels an existing local number as SMS-class. Production has no
-- rows at all; this only matters for local/dev data. The service still ORs the
-- prefix check into its reuse query as a second line of defence.
UPDATE "telephony"."TelephonyPhoneNumber"
   SET "numberType" = 'local'
 WHERE "phoneNumberE164" NOT LIKE '+614%';

-- An organisation needs a mobile to text and a local to call, so a completed run
-- chains a run for the other class by default. False opts a run out (a deliberate
-- single-class request, or the chained run itself, which must never chain back).
ALTER TABLE "telephony"."TelephonyProvisioningRun"
  ADD COLUMN "chainComplementary" BOOLEAN NOT NULL DEFAULT true;
