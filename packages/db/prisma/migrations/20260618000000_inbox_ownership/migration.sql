-- Inbox conversation ownership (E2): server-held claim/release, replacing the
-- client-side localStorage owner map. Additive columns only.
ALTER TABLE "ConversationState" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "ConversationState" ADD COLUMN "claimedAt" TIMESTAMP(3);

-- Owner lookups per org (e.g. "my conversations").
CREATE INDEX "ConversationState_organizationId_ownerId_idx" ON "ConversationState"("organizationId", "ownerId");
