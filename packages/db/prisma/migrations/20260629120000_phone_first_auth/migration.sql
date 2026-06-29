-- Phone-first volunteer/canvasser auth (additive).
-- Applied with `prisma migrate deploy` (never `migrate dev`).

-- Generalise the OTP table so it can carry a pre-user, phone-addressed challenge
-- (passwordless phone login) and cap brute-force attempts.
ALTER TABLE "iam"."MobileVerification" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "iam"."MobileVerification" ADD COLUMN "mobile" TEXT;
ALTER TABLE "iam"."MobileVerification" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "MobileVerification_mobile_idx" ON "iam"."MobileVerification"("mobile");

-- Phone becomes a login identifier. Postgres allows unlimited NULLs under a UNIQUE
-- index, so users without a mobile are unaffected. This CREATE will fail loudly if
-- the table already holds duplicate non-null mobiles — pre-check before deploying:
--   SELECT mobile, count(*) FROM "iam"."User" WHERE mobile IS NOT NULL
--     GROUP BY mobile HAVING count(*) > 1;
CREATE UNIQUE INDEX "User_mobile_key" ON "iam"."User"("mobile");

-- Phone-aware invitations: email is now optional (phone-only invites), with a
-- matching per-tenant unique on phone.
ALTER TABLE "tenant"."TenantInvitation" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "tenant"."TenantInvitation" ADD COLUMN "phone" TEXT;
CREATE UNIQUE INDEX "TenantInvitation_tenantId_phone_key" ON "tenant"."TenantInvitation"("tenantId", "phone");

-- Phone-based join requests record the number so the organiser queue shows it.
ALTER TABLE "tenant"."TenantJoinRequest" ADD COLUMN "phone" TEXT;
