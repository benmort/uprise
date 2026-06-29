-- Volunteer canvasser preferences captured at onboarding (additive).
-- preferredRole: hander-outer | doorknocker | booth-captain | scrutineer (advisory).
-- availabilityDays: weekday short names the volunteer can usually help (e.g. {Sat,Sun}).
ALTER TABLE "tenant"."TenantMember"
  ADD COLUMN IF NOT EXISTS "preferredRole" TEXT,
  ADD COLUMN IF NOT EXISTS "availabilityDays" TEXT[] NOT NULL DEFAULT '{}';
