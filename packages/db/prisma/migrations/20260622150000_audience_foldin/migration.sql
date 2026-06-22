-- Audience fold-in (meld doc 10). Additive: identity resolution + source-record
-- provenance + dynamic segments. Hand-written (migrate deploy) so the raw partial
-- unique indexes on public."Contact" are untouched.

-- 1. Identity resolution on Contact.
ALTER TABLE "public"."Contact" ADD COLUMN "canonicalContactId" TEXT;
CREATE INDEX "Contact_canonicalContactId_idx" ON "public"."Contact" ("canonicalContactId");
CREATE INDEX "Contact_tenantId_email_idx" ON "public"."Contact" ("tenantId", "email");

-- 2. Multi-source provenance (audience schema).
CREATE TABLE "audience"."ContactSourceRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactSourceRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContactSourceRecord_sourceSystem_externalId_key" ON "audience"."ContactSourceRecord" ("sourceSystem", "externalId");
CREATE INDEX "ContactSourceRecord_contactId_idx" ON "audience"."ContactSourceRecord" ("contactId");
CREATE INDEX "ContactSourceRecord_tenantId_sourceSystem_idx" ON "audience"."ContactSourceRecord" ("tenantId", "sourceSystem");

-- 3. Static vs dynamic segments.
CREATE TYPE "audience"."AudienceSegmentType" AS ENUM ('STATIC', 'DYNAMIC');
ALTER TABLE "audience"."AudienceSegment" ADD COLUMN "type" "audience"."AudienceSegmentType" NOT NULL DEFAULT 'DYNAMIC';
CREATE INDEX "AudienceSegment_audienceId_type_idx" ON "audience"."AudienceSegment" ("audienceId", "type");

-- 4. Materialised dynamic-segment membership.
CREATE TABLE "audience"."AudienceSegmentMember" (
    "segmentId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AudienceSegmentMember_pkey" PRIMARY KEY ("segmentId", "contactId")
);
CREATE INDEX "AudienceSegmentMember_contactId_idx" ON "audience"."AudienceSegmentMember" ("contactId");
ALTER TABLE "audience"."AudienceSegmentMember" ADD CONSTRAINT "AudienceSegmentMember_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "audience"."AudienceSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
