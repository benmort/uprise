-- Topbar-gaps phase. Additive. Hand-written (migrate deploy) so the raw partial
-- unique indexes elsewhere are untouched.

-- 1. Self-service account deletion (soft-delete).
ALTER TABLE "iam"."User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- 2. Active-sessions list (device/IP/last-seen).
ALTER TABLE "iam"."Session" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "iam"."Session" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "iam"."Session" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

-- 3. Richer user profile (prog parity: DOB + social links).
ALTER TABLE "iam"."UserProfile" ADD COLUMN "dateOfBirth" TIMESTAMP(3);
ALTER TABLE "iam"."UserProfile" ADD COLUMN "facebookUrl" TEXT;
ALTER TABLE "iam"."UserProfile" ADD COLUMN "twitterUrl" TEXT;
ALTER TABLE "iam"."UserProfile" ADD COLUMN "linkedinUrl" TEXT;
ALTER TABLE "iam"."UserProfile" ADD COLUMN "instagramUrl" TEXT;
ALTER TABLE "iam"."UserProfile" ADD COLUMN "websiteUrl" TEXT;
