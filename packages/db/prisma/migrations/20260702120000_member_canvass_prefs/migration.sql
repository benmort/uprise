-- Member canvass prefs. Additive. Hand-written (migrate deploy) so the raw partial
-- unique indexes elsewhere are untouched.

-- Activity-specific onboarding answers (advisory), captured in the volunteer wizard —
-- e.g. a doorknocker's walking capability + preferred session length. A JSON bag so
-- new per-activity questions don't each need a migration.
ALTER TABLE "tenant"."TenantMember" ADD COLUMN "canvassPrefs" JSONB;
