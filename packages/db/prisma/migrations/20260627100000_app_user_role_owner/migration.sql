-- Add OWNER to the AppUserRole enum (additive). Workspace creators default to OWNER.
-- Inserted before ORGANISER so the DB enum order matches schema.prisma (OWNER, ORGANISER, CANVASSER).
-- Must be its own migration: Postgres cannot use a newly-added enum value in the same
-- transaction that adds it, so the backfill lives in the next migration.
ALTER TYPE "iam"."AppUserRole" ADD VALUE IF NOT EXISTS 'OWNER' BEFORE 'ORGANISER';
