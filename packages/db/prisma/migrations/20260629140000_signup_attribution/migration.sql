-- Signup attribution (additive). Records where an account came from at sign-up so the
-- auth/signup interface can adapt and signup funnels can be analysed. Applied with
-- `prisma migrate deploy`.
ALTER TABLE "iam"."User" ADD COLUMN "signupSource" TEXT;
ALTER TABLE "iam"."User" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "iam"."User" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "iam"."User" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "iam"."User" ADD COLUMN "referrerChannel" TEXT;
