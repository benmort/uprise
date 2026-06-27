-- Rename the canvasser-as-field-worker FK columns canvasserId → volunteerId on the three
-- canvass tables (RENAME COLUMN preserves data + the underlying index/constraint identity).
-- Indexes and FK constraints are renamed too so Prisma's auto-generated names stay in sync
-- (a column rename does NOT auto-rename them in Postgres).

ALTER TABLE "canvass"."TurfAssignment" RENAME COLUMN "canvasserId" TO "volunteerId";
ALTER INDEX "canvass"."TurfAssignment_canvasserId_status_idx" RENAME TO "TurfAssignment_volunteerId_status_idx";
ALTER TABLE "canvass"."TurfAssignment" RENAME CONSTRAINT "TurfAssignment_canvasserId_fkey" TO "TurfAssignment_volunteerId_fkey";

ALTER TABLE "canvass"."DoorKnock" RENAME COLUMN "canvasserId" TO "volunteerId";
ALTER INDEX "canvass"."DoorKnock_canvasserId_createdAt_idx" RENAME TO "DoorKnock_volunteerId_createdAt_idx";
ALTER TABLE "canvass"."DoorKnock" RENAME CONSTRAINT "DoorKnock_canvasserId_fkey" TO "DoorKnock_volunteerId_fkey";

-- Shift.canvasserId is an id-only reference (no FK constraint), so only the column + index.
ALTER TABLE "canvass"."Shift" RENAME COLUMN "canvasserId" TO "volunteerId";
ALTER INDEX "canvass"."Shift_tenantId_canvasserId_idx" RENAME TO "Shift_tenantId_volunteerId_idx";
