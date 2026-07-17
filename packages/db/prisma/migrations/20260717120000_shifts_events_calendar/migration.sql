-- Shifts, Events & Calendar (additive; applied with `prisma migrate deploy`).
--
-- 1) Generalises Shift beyond canvassing (type/capacity + id-only links to an
--    Event or a polling place) and adds a ShiftAssignment roster mirroring
--    TurfAssignment (organiser-assign + volunteer self-signup; one active seat
--    per volunteer per shift; capacity-bounded).
-- 2) Adds a real Events domain (Event + EventRsvp) in the `events` schema —
--    public happenings people RSVP to; attendee count derives from EventRsvp.
-- 3) Adds a generic CalendarEntry for ad-hoc calendar items.
--
-- New enums are created fresh (CREATE TYPE) and used as column defaults in the
-- same migration — safe, unlike `ALTER TYPE ... ADD VALUE`. Cross-domain refs
-- (campaignId, eventId, pollingPlaceId, contactId) are id-only (no FK); the
-- tenant/user/shift/event FKs follow the shared-kernel pattern (cf. TurfAssignment,
-- ContactTag).

-- ── enums ────────────────────────────────────────────────────────────────
CREATE TYPE "canvass"."ShiftType" AS ENUM ('CANVASS', 'POLLING_BOOTH', 'EVENT', 'GENERAL');
CREATE TYPE "canvass"."ShiftAssignmentStatus" AS ENUM ('REQUESTED', 'ASSIGNED', 'RELEASED');
CREATE TYPE "events"."EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');
CREATE TYPE "events"."RsvpStatus" AS ENUM ('GOING', 'WAITLIST', 'CANCELLED', 'ATTENDED');

-- ── Shift: generalise (additive columns; campaignId is already nullable) ───
ALTER TABLE "canvass"."Shift"
  ADD COLUMN IF NOT EXISTS "type" "canvass"."ShiftType" NOT NULL DEFAULT 'CANVASS',
  ADD COLUMN IF NOT EXISTS "eventId" TEXT,
  ADD COLUMN IF NOT EXISTS "pollingPlaceId" TEXT,
  ADD COLUMN IF NOT EXISTS "capacity" INTEGER;
CREATE INDEX IF NOT EXISTS "Shift_tenantId_type_startsAt_idx" ON "canvass"."Shift"("tenantId", "type", "startsAt");
CREATE INDEX IF NOT EXISTS "Shift_eventId_idx" ON "canvass"."Shift"("eventId");

-- ── ShiftAssignment roster (mirrors TurfAssignment) ────────────────────────
CREATE TABLE "canvass"."ShiftAssignment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "volunteerId" TEXT NOT NULL,
  "status" "canvass"."ShiftAssignmentStatus" NOT NULL DEFAULT 'REQUESTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShiftAssignment_tenantId_shiftId_idx" ON "canvass"."ShiftAssignment"("tenantId", "shiftId");
CREATE INDEX "ShiftAssignment_shiftId_status_idx" ON "canvass"."ShiftAssignment"("shiftId", "status");
CREATE INDEX "ShiftAssignment_volunteerId_status_idx" ON "canvass"."ShiftAssignment"("volunteerId", "status");
ALTER TABLE "canvass"."ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "canvass"."ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "canvass"."Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "canvass"."ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "iam"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Event (events schema) ──────────────────────────────────────────────────
CREATE TABLE "events"."Event" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "campaignId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "status" "events"."EventStatus" NOT NULL DEFAULT 'DRAFT',
  "location" TEXT,
  "pollingPlaceId" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "capacity" INTEGER,
  "imageUrl" TEXT,
  "publicRsvpEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Event_tenantId_startsAt_idx" ON "events"."Event"("tenantId", "startsAt");
CREATE INDEX "Event_tenantId_campaignId_idx" ON "events"."Event"("tenantId", "campaignId");
ALTER TABLE "events"."Event" ADD CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── EventRsvp ──────────────────────────────────────────────────────────────
CREATE TABLE "events"."EventRsvp" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "contactId" TEXT,
  "volunteerId" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "status" "events"."RsvpStatus" NOT NULL DEFAULT 'GOING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventRsvp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventRsvp_tenantId_eventId_idx" ON "events"."EventRsvp"("tenantId", "eventId");
CREATE INDEX "EventRsvp_eventId_status_idx" ON "events"."EventRsvp"("eventId", "status");
ALTER TABLE "events"."EventRsvp" ADD CONSTRAINT "EventRsvp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "events"."EventRsvp" ADD CONSTRAINT "EventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── CalendarEntry (generic ad-hoc items) ───────────────────────────────────
CREATE TABLE "events"."CalendarEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CalendarEntry_tenantId_startsAt_idx" ON "events"."CalendarEntry"("tenantId", "startsAt");
ALTER TABLE "events"."CalendarEntry" ADD CONSTRAINT "CalendarEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── partial unique indexes (Prisma DSL can't express; hand-maintained) ─────
-- One active (ASSIGNED) seat per volunteer per shift; REQUESTED/RELEASED can repeat.
CREATE UNIQUE INDEX "ShiftAssignment_one_active_per_volunteer" ON "canvass"."ShiftAssignment" ("shiftId", "volunteerId") WHERE "status" = 'ASSIGNED';
-- Dedupe RSVPs per event by email (case-insensitive); anonymous (null email) RSVPs are exempt.
CREATE UNIQUE INDEX "EventRsvp_one_per_email" ON "events"."EventRsvp" ("eventId", lower("email")) WHERE "email" IS NOT NULL;
