-- P2P texting: blasts link to canvass campaigns (text banks), blast recipients carry a
-- volunteer assignee for press-send claiming, and invitations carry the invited channel.
ALTER TABLE "messaging"."Blast" ADD COLUMN "campaignId" TEXT;
CREATE INDEX "Blast_campaignId_idx" ON "messaging"."Blast"("campaignId");

ALTER TABLE "messaging"."BlastRecipient" ADD COLUMN "assigneeId" TEXT;
ALTER TABLE "messaging"."BlastRecipient" ADD COLUMN "assignedAt" TIMESTAMP(3);
CREATE INDEX "BlastRecipient_blastId_assigneeId_idx" ON "messaging"."BlastRecipient"("blastId", "assigneeId");

ALTER TABLE "tenant"."TenantInvitation" ADD COLUMN "invitedChannel" TEXT;
