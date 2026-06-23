-- WS3 (meld doc 12): record last sign-in for audit/analytics.
ALTER TABLE "iam"."User" ADD COLUMN "lastSignInAt" TIMESTAMP(3);
