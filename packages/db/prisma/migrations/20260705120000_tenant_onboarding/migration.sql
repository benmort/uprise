-- Tenant organiser onboarding progress. Additive. Hand-written (migrate deploy) so the
-- raw partial unique indexes elsewhere are untouched.

-- Per-tenant organiser getting-started progress (advisory): completed setup steps +
-- a dismissed flag for the dashboard nudge. A JSON bag so new steps don't need a
-- migration. Shape defined in @uprise/contracts (TenantOnboarding).
ALTER TABLE "tenant"."Tenant" ADD COLUMN "onboarding" JSONB;
