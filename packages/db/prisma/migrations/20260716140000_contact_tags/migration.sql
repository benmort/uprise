-- Contact tags: a tenant label taxonomy applied to contacts by responses/automations.
-- Additive; public schema (same schema as Contact so the assignment FK is legal).

CREATE TABLE "public"."ContactTag" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "color" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContactTag_tenantId_key_key" ON "public"."ContactTag"("tenantId", "key");
CREATE INDEX "ContactTag_tenantId_idx" ON "public"."ContactTag"("tenantId");
ALTER TABLE "public"."ContactTag" ADD CONSTRAINT "ContactTag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."ContactTagAssignment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactTagAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContactTagAssignment_tenantId_contactId_tagId_key" ON "public"."ContactTagAssignment"("tenantId", "contactId", "tagId");
CREATE INDEX "ContactTagAssignment_tenantId_contactId_idx" ON "public"."ContactTagAssignment"("tenantId", "contactId");
CREATE INDEX "ContactTagAssignment_tagId_idx" ON "public"."ContactTagAssignment"("tagId");
ALTER TABLE "public"."ContactTagAssignment" ADD CONSTRAINT "ContactTagAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ContactTagAssignment" ADD CONSTRAINT "ContactTagAssignment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ContactTagAssignment" ADD CONSTRAINT "ContactTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."ContactTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
