-- Phase 1: persistent Contact spine.
-- Additive + nullable: creates Contact, adds nullable contactId FKs to the
-- existing phone/audience-keyed tables, and enforces dedup via partial unique
-- indexes. All existing uniques and phone columns are left intact so the live
-- inbox + blast pipeline keep working unchanged. Data backfill is NOT done here
-- (it runs as a resumable app-side job) to keep this migration fast and avoid
-- locking the live inbound-write path.

-- 1. Contact table
CREATE TABLE "Contact" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "phoneE164"      TEXT,
  "addressNorm"    TEXT,
  "firstName"      TEXT,
  "lastName"       TEXT,
  "email"          TEXT,
  "address"        TEXT,
  "lat"            DOUBLE PRECISION,
  "lng"            DOUBLE PRECISION,
  "turfId"         TEXT,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Contact_organizationId_phoneE164_idx"   ON "Contact" ("organizationId", "phoneE164");
CREATE INDEX "Contact_organizationId_addressNorm_idx" ON "Contact" ("organizationId", "addressNorm");
CREATE INDEX "Contact_organizationId_turfId_idx"      ON "Contact" ("organizationId", "turfId");

-- Dedup backstop: one Contact per (org, phone) and per (org, address),
-- independently. Partial so address-only and phone-only contacts both dedup.
CREATE UNIQUE INDEX "Contact_org_phoneE164_key"
  ON "Contact" ("organizationId", "phoneE164")
  WHERE "phoneE164" IS NOT NULL;
CREATE UNIQUE INDEX "Contact_org_addressNorm_key"
  ON "Contact" ("organizationId", "addressNorm")
  WHERE "addressNorm" IS NOT NULL;

ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Nullable contactId FK columns on the re-keyed tables.
-- BlastRecipient.contactId already exists (previously held an AudienceContact id
-- with no FK); the rest are new columns.
ALTER TABLE "AudienceContact"   ADD COLUMN "contactId" TEXT;
ALTER TABLE "InboundMessage"    ADD COLUMN "contactId" TEXT;
ALTER TABLE "OutboundMessage"   ADD COLUMN "contactId" TEXT;
ALTER TABLE "ConversationState" ADD COLUMN "contactId" TEXT;

-- 3. NULL-guard the pre-existing BlastRecipient.contactId values. They hold
-- AudienceContact ids, which would violate the new FK to Contact. Backfill
-- re-points them to real Contact ids afterwards.
UPDATE "BlastRecipient"
  SET "contactId" = NULL
  WHERE "contactId" IS NOT NULL
    AND "contactId" NOT IN (SELECT "id" FROM "Contact");

-- 4. Indexes on the new FK columns.
CREATE INDEX "AudienceContact_contactId_idx"   ON "AudienceContact" ("contactId");
CREATE INDEX "BlastRecipient_contactId_idx"    ON "BlastRecipient" ("contactId");
CREATE INDEX "InboundMessage_contactId_idx"    ON "InboundMessage" ("contactId");
CREATE INDEX "OutboundMessage_contactId_idx"   ON "OutboundMessage" ("contactId");
-- One conversation per contact (multiple NULLs allowed pre-backfill).
CREATE UNIQUE INDEX "ConversationState_contactId_key" ON "ConversationState" ("contactId");

-- 5. FK constraints (SET NULL: a contact merge/delete must not cascade-destroy
-- messages or recipients).
ALTER TABLE "AudienceContact"
  ADD CONSTRAINT "AudienceContact_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BlastRecipient"
  ADD CONSTRAINT "BlastRecipient_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboundMessage"
  ADD CONSTRAINT "InboundMessage_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationState"
  ADD CONSTRAINT "ConversationState_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
