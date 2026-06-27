-- Rename the AppUserRole enum value CANVASSER -> VOLUNTEER.
-- RENAME VALUE preserves the enum's position and every existing row's value
-- (no data migration, no index drop), unlike a drop/recreate.
ALTER TYPE "iam"."AppUserRole" RENAME VALUE 'CANVASSER' TO 'VOLUNTEER';

-- Tenant-independent super-admin flag. Source of truth for cross-tenant god-mode;
-- set only by a direct row update, never through any API or role picker.
ALTER TABLE "iam"."User"
  ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
