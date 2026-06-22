-- RenameForeignKey
ALTER TABLE "AnalyticsSnapshot" RENAME CONSTRAINT "AnalyticsSnapshot_blast_fk" TO "AnalyticsSnapshot_blastId_fkey";

-- RenameForeignKey
ALTER TABLE "AnalyticsSnapshot" RENAME CONSTRAINT "AnalyticsSnapshot_org_fk" TO "AnalyticsSnapshot_organizationId_fkey";

-- RenameForeignKey
ALTER TABLE "AppUser" RENAME CONSTRAINT "AppUser_org_fk" TO "AppUser_organizationId_fkey";

-- RenameForeignKey
ALTER TABLE "Audience" RENAME CONSTRAINT "Audience_org_fk" TO "Audience_organizationId_fkey";

-- RenameForeignKey
ALTER TABLE "Audience" RENAME CONSTRAINT "Audience_user_fk" TO "Audience_createdById_fkey";

-- RenameForeignKey
ALTER TABLE "AudienceContact" RENAME CONSTRAINT "AudienceContact_audience_fk" TO "AudienceContact_audienceId_fkey";

-- RenameForeignKey
ALTER TABLE "AudienceImport" RENAME CONSTRAINT "AudienceImport_audience_fk" TO "AudienceImport_audienceId_fkey";

-- RenameForeignKey
ALTER TABLE "AudienceSegment" RENAME CONSTRAINT "AudienceSegment_audience_fk" TO "AudienceSegment_audienceId_fkey";

-- RenameForeignKey
ALTER TABLE "Blast" RENAME CONSTRAINT "Blast_audience_fk" TO "Blast_audienceId_fkey";

-- RenameForeignKey
ALTER TABLE "Blast" RENAME CONSTRAINT "Blast_org_fk" TO "Blast_organizationId_fkey";

-- RenameForeignKey
ALTER TABLE "Blast" RENAME CONSTRAINT "Blast_user_fk" TO "Blast_createdById_fkey";

-- RenameForeignKey
ALTER TABLE "BlastRecipient" RENAME CONSTRAINT "BlastRecipient_blast_fk" TO "BlastRecipient_blastId_fkey";

-- RenameForeignKey
ALTER TABLE "BlastTemplate" RENAME CONSTRAINT "BlastTemplate_blast_fk" TO "BlastTemplate_blastId_fkey";

-- RenameForeignKey
ALTER TABLE "ConversationState" RENAME CONSTRAINT "ConversationState_org_fk" TO "ConversationState_organizationId_fkey";

-- RenameForeignKey
ALTER TABLE "InboundMessage" RENAME CONSTRAINT "Inbound_blast_fk" TO "InboundMessage_blastId_fkey";

-- RenameForeignKey
ALTER TABLE "InboundMessage" RENAME CONSTRAINT "Inbound_org_fk" TO "InboundMessage_organizationId_fkey";

-- RenameForeignKey
ALTER TABLE "IntegrationConnection" RENAME CONSTRAINT "IntegrationConnection_org_fk" TO "IntegrationConnection_organizationId_fkey";

-- RenameForeignKey
ALTER TABLE "IntegrationSyncJob" RENAME CONSTRAINT "IntegrationSyncJob_connection_fk" TO "IntegrationSyncJob_integrationConnectionId_fkey";

-- RenameForeignKey
ALTER TABLE "OutboundMessage" RENAME CONSTRAINT "Outbound_blast_fk" TO "OutboundMessage_blastId_fkey";

-- RenameForeignKey
ALTER TABLE "OutboundMessage" RENAME CONSTRAINT "Outbound_org_fk" TO "OutboundMessage_organizationId_fkey";

-- RenameIndex
ALTER INDEX "Analytics_metric_bucket_idx" RENAME TO "AnalyticsSnapshot_organizationId_metricName_bucketAt_idx";

-- RenameIndex
ALTER INDEX "Audience_org_status_idx" RENAME TO "Audience_organizationId_status_idx";

-- RenameIndex
ALTER INDEX "AudienceContact_audience_phone_unique" RENAME TO "AudienceContact_audienceId_phoneE164_key";

-- RenameIndex
ALTER INDEX "AudienceContact_org_phone_idx" RENAME TO "AudienceContact_organizationId_phoneE164_idx";

-- RenameIndex
ALTER INDEX "Blast_org_status_idx" RENAME TO "Blast_organizationId_status_idx";

-- RenameIndex
ALTER INDEX "BlastRecipient_blast_status_idx" RENAME TO "BlastRecipient_blastId_status_idx";

-- RenameIndex
ALTER INDEX "BlastRecipient_phone_idx" RENAME TO "BlastRecipient_phoneE164_idx";

-- RenameIndex
ALTER INDEX "BlastTemplate_blast_version_unique" RENAME TO "BlastTemplate_blastId_version_key";

-- RenameIndex
ALTER INDEX "ConversationState_org_contact_unique" RENAME TO "ConversationState_organizationId_contactPhone_key";

-- RenameIndex
ALTER INDEX "Inbound_thread_idx" RENAME TO "InboundMessage_organizationId_threadKey_receivedAt_idx";

-- RenameIndex
ALTER INDEX "Integration_lookup_idx" RENAME TO "IntegrationConnection_organizationId_type_status_idx";

-- RenameIndex
ALTER INDEX "Outbound_lookup_idx" RENAME TO "OutboundMessage_organizationId_toPhone_sentAt_idx";
