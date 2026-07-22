-- Tenant lifecycle status (additive; applied with `prisma migrate deploy`).
--
-- A super-admin-set lifecycle distinct from `deletedAt` (the soft-delete): ACTIVE (default),
-- SUSPENDED (paused), ARCHIVED (wound down, kept for records). Surfaced in the super-admin
-- tenants listing alongside the plan. Backfills every existing tenant to ACTIVE via the default.

CREATE TYPE "tenant"."TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

ALTER TABLE "tenant"."Tenant"
  ADD COLUMN IF NOT EXISTS "status" "tenant"."TenantStatus" NOT NULL DEFAULT 'ACTIVE';
