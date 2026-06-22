-- IAM auth flows (meld doc 14). Additive: per-session active tenant + email-verified flag.
ALTER TABLE "iam"."Session" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "iam"."User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
