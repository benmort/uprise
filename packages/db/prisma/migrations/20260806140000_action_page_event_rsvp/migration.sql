-- Event RSVP action pages (additive; applied with `prisma migrate deploy`).
--
-- An action page is the shareable, embeddable, unguessable-slug front door: brand, prefill,
-- captcha, embed allowlist, DRAFT/PUBLISHED lifecycle. Until now the only thing behind one was
-- a dialler campaign. This points the same surface at an event.
--
-- Deliberately id-only (no FK): actions and events are separate schemas and the cross-schema
-- rule is references-by-id. The event keeps owning capacity, waitlisting and the RSVP rows —
-- this page is a front door, not a copy, so one event can be promoted through several pages
-- (or embedded on a partner's site) without any of that state being duplicated.

-- ADD VALUE only — a new enum value cannot be USED in the transaction that adds it, which is
-- why nothing below writes 'EVENT_RSVP'.
ALTER TYPE actions."ActionPageType" ADD VALUE IF NOT EXISTS 'EVENT_RSVP';

ALTER TABLE "actions"."ActionPage" ADD COLUMN IF NOT EXISTS "eventId" TEXT;

-- Mirrors the campaignId index: "which pages point at this event?" is asked when an event is
-- edited or cancelled, and when the admin list is filtered.
CREATE INDEX IF NOT EXISTS "ActionPage_tenantId_eventId_idx"
    ON "actions"."ActionPage"("tenantId", "eventId");
