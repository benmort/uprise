-- DESTRUCTIVE (index-only; no data loss) — operator-approved 2026-08-07.
-- Each dropped index is a strict leftmost prefix of a unique index on the same
-- table (pure write amplification), except CanvassHeatCell_runId_idx which is
-- raw-only drift: dropping it RESTORES schema.prisma parity.
DROP INDEX IF EXISTS "canvass"."ContentBinding_tenantId_objectType_objectId_idx";   -- prefix of ContentBinding_object_content_slot_key
DROP INDEX IF EXISTS "public"."ContactTagAssignment_tenantId_contactId_idx";        -- prefix of ContactTagAssignment_tenantId_contactId_tagId_key
DROP INDEX IF EXISTS "autodialer"."DialerAttempt_campaignId_phoneE164_idx";         -- prefix of DialerAttempt_campaignId_phoneE164_attemptNo_key
DROP INDEX IF EXISTS "audience"."ContactSourceRecord_tenantId_sourceSystem_idx";    -- prefix of ContactSourceRecord_tenantId_sourceSystem_externalId_key
DROP INDEX IF EXISTS "public"."Contact_tenantId_addressNorm_idx";                   -- covered by partial unique Contact_tenantId_addressNorm_key
DROP INDEX IF EXISTS "canvass"."CanvassHeatCell_runId_idx";                         -- prefix of CanvassHeatCell_runId_sa1Code_key (raw-only; no schema entry)
