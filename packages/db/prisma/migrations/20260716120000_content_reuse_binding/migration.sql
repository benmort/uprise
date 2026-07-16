-- Content reuse: polymorphic ContentBinding + disposition/canned sets.
-- Additive only. Schema-qualified (uprise is multi-schema).

-- Enums
CREATE TYPE "canvass"."ContentType" AS ENUM ('SURVEY', 'SCRIPT', 'DISPOSITION_SET', 'CANNED_SET');
CREATE TYPE "canvass"."ContentObjectType" AS ENUM ('CANVASS_CAMPAIGN', 'BLAST');
CREATE TYPE "canvass"."ContentSlot" AS ENUM ('PRIMARY', 'OPENING', 'PERSUASION', 'FOLLOW_UP');

-- ContentBinding: polymorphic join (contentId + objectId are bare ids, no FK).
CREATE TABLE "canvass"."ContentBinding" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "contentType" "canvass"."ContentType" NOT NULL,
  "contentId" TEXT NOT NULL,
  "objectType" "canvass"."ContentObjectType" NOT NULL,
  "objectId" TEXT NOT NULL,
  "slot" "canvass"."ContentSlot" NOT NULL DEFAULT 'PRIMARY',
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentBinding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContentBinding_object_content_slot_key" ON "canvass"."ContentBinding"("tenantId", "objectType", "objectId", "contentType", "slot");
CREATE INDEX "ContentBinding_tenantId_contentType_contentId_idx" ON "canvass"."ContentBinding"("tenantId", "contentType", "contentId");
CREATE INDEX "ContentBinding_tenantId_objectType_objectId_idx" ON "canvass"."ContentBinding"("tenantId", "objectType", "objectId");
ALTER TABLE "canvass"."ContentBinding" ADD CONSTRAINT "ContentBinding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DispositionSet + items
CREATE TABLE "canvass"."DispositionSet" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DispositionSet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DispositionSet_tenantId_isArchived_idx" ON "canvass"."DispositionSet"("tenantId", "isArchived");
ALTER TABLE "canvass"."DispositionSet" ADD CONSTRAINT "DispositionSet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "canvass"."DispositionSetItem" (
  "id" TEXT NOT NULL,
  "setId" TEXT NOT NULL,
  "dispositionDefId" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "DispositionSetItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DispositionSetItem_setId_dispositionDefId_key" ON "canvass"."DispositionSetItem"("setId", "dispositionDefId");
CREATE INDEX "DispositionSetItem_setId_orderIndex_idx" ON "canvass"."DispositionSetItem"("setId", "orderIndex");
ALTER TABLE "canvass"."DispositionSetItem" ADD CONSTRAINT "DispositionSetItem_setId_fkey" FOREIGN KEY ("setId") REFERENCES "canvass"."DispositionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "canvass"."DispositionSetItem" ADD CONSTRAINT "DispositionSetItem_dispositionDefId_fkey" FOREIGN KEY ("dispositionDefId") REFERENCES "canvass"."DispositionDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CannedSet + items
CREATE TABLE "canvass"."CannedSet" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CannedSet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CannedSet_tenantId_isArchived_idx" ON "canvass"."CannedSet"("tenantId", "isArchived");
ALTER TABLE "canvass"."CannedSet" ADD CONSTRAINT "CannedSet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "canvass"."CannedSetItem" (
  "id" TEXT NOT NULL,
  "setId" TEXT NOT NULL,
  "cannedResponseId" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CannedSetItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CannedSetItem_setId_cannedResponseId_key" ON "canvass"."CannedSetItem"("setId", "cannedResponseId");
CREATE INDEX "CannedSetItem_setId_orderIndex_idx" ON "canvass"."CannedSetItem"("setId", "orderIndex");
ALTER TABLE "canvass"."CannedSetItem" ADD CONSTRAINT "CannedSetItem_setId_fkey" FOREIGN KEY ("setId") REFERENCES "canvass"."CannedSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "canvass"."CannedSetItem" ADD CONSTRAINT "CannedSetItem_cannedResponseId_fkey" FOREIGN KEY ("cannedResponseId") REFERENCES "canvass"."CannedResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: seed a PRIMARY binding from each campaign's existing 1:1 survey/script.
INSERT INTO "canvass"."ContentBinding" ("id", "tenantId", "contentType", "contentId", "objectType", "objectId", "slot", "orderIndex", "createdAt")
SELECT gen_random_uuid()::text, c."tenantId", 'SURVEY'::"canvass"."ContentType", c."surveyId", 'CANVASS_CAMPAIGN'::"canvass"."ContentObjectType", c."id", 'PRIMARY'::"canvass"."ContentSlot", 0, CURRENT_TIMESTAMP
FROM "canvass"."CanvassCampaign" c
WHERE c."surveyId" IS NOT NULL;

INSERT INTO "canvass"."ContentBinding" ("id", "tenantId", "contentType", "contentId", "objectType", "objectId", "slot", "orderIndex", "createdAt")
SELECT gen_random_uuid()::text, c."tenantId", 'SCRIPT'::"canvass"."ContentType", c."scriptId", 'CANVASS_CAMPAIGN'::"canvass"."ContentObjectType", c."id", 'PRIMARY'::"canvass"."ContentSlot", 0, CURRENT_TIMESTAMP
FROM "canvass"."CanvassCampaign" c
WHERE c."scriptId" IS NOT NULL;
