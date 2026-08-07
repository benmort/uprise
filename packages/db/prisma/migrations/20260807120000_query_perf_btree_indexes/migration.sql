-- Query-efficiency audit remediation: hot-path btree indexes.
-- Additive; applied with `prisma migrate deploy`. Every index here is mirrored
-- as @@index in schema.prisma. Plain ASC btree (backward scans serve DESC sorts);
-- no CONCURRENTLY (migrate deploy wraps this file in a transaction).

-- ── canvass ──────────────────────────────────────────────────────────────────
-- Tenant-scoped time watermarks / doors-today / recent-knock reads
-- (heat.service.ts, campaigns.service.ts, iam-flows.service.ts open-join count).
CREATE INDEX IF NOT EXISTS "DoorKnock_tenantId_createdAt_idx"
  ON "canvass"."DoorKnock" ("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "Disposition_tenantId_createdAt_idx"
  ON "canvass"."Disposition" ("tenantId", "createdAt");

-- Volunteer-metrics persuasion groupBy (canvassing.service.ts) — mirrors the
-- existing QuestionResponse_recordedBy_idx sibling.
CREATE INDEX IF NOT EXISTS "Disposition_recordedBy_idx"
  ON "canvass"."Disposition" ("tenantId", "recordedById", "channel", "createdAt");

-- Field-report supporter accumulation (campaigns.service.ts) and the
-- contact.supportLevel segment leaf (prefix use).
CREATE INDEX IF NOT EXISTS "Disposition_tenantId_supportLevel_createdAt_idx"
  ON "canvass"."Disposition" ("tenantId", "supportLevel", "createdAt");

-- activity.lastActiveWithin segment leaf (segment-leaf-resolver.service.ts).
CREATE INDEX IF NOT EXISTS "QuestionResponse_tenantId_createdAt_idx"
  ON "canvass"."QuestionResponse" ("tenantId", "createdAt");

-- QuestionOption delete → ON DELETE SET NULL probe on every survey save.
CREATE INDEX IF NOT EXISTS "QuestionResponse_optionId_idx"
  ON "canvass"."QuestionResponse" ("optionId");

-- Contact delete/merge → ON DELETE CASCADE probe.
CREATE INDEX IF NOT EXISTS "WalkListItem_contactId_idx"
  ON "canvass"."WalkListItem" ("contactId");

-- Calendar shift window (calendar.service.ts).
CREATE INDEX IF NOT EXISTS "Shift_tenantId_startsAt_idx"
  ON "canvass"."Shift" ("tenantId", "startsAt");

-- ── public ───────────────────────────────────────────────────────────────────
-- contact.createdAt segment leaf (segment-leaf-resolver.service.ts).
CREATE INDEX IF NOT EXISTS "Contact_tenantId_createdAt_idx"
  ON "public"."Contact" ("tenantId", "createdAt");

-- ── tenant ───────────────────────────────────────────────────────────────────
-- Principal resolution on every authenticated request (session.service.ts)
-- + selfServeDelete + the iam.User ON DELETE CASCADE probe.
CREATE INDEX IF NOT EXISTS "TenantMember_userId_createdAt_idx"
  ON "tenant"."TenantMember" ("userId", "createdAt");

-- Membership-less sign-in fallback (iam-flows.service.ts).
CREATE INDEX IF NOT EXISTS "TenantJoinRequest_userId_status_idx"
  ON "tenant"."TenantJoinRequest" ("userId", "status");

-- File-manager listing (files.service.ts).
CREATE INDEX IF NOT EXISTS "StoredFile_tenantId_createdAt_idx"
  ON "tenant"."StoredFile" ("tenantId", "createdAt");

-- ── messaging ────────────────────────────────────────────────────────────────
-- blast.replied segment leaf; prefix also serves listContactPhonesForBlast.
CREATE INDEX IF NOT EXISTS "InboundMessage_tenantId_blastId_receivedAt_idx"
  ON "messaging"."InboundMessage" ("tenantId", "blastId", "receivedAt");

-- Inbox thread open + reply-sender resolution and the WhatsApp 24-h session
-- window (channel is a cheap recheck).
CREATE INDEX IF NOT EXISTS "InboundMessage_tenantId_fromPhone_receivedAt_idx"
  ON "messaging"."InboundMessage" ("tenantId", "fromPhone", "receivedAt");

-- activity.lastActiveWithin segment leaf + windowed inbox recent-contacts.
CREATE INDEX IF NOT EXISTS "InboundMessage_tenantId_receivedAt_idx"
  ON "messaging"."InboundMessage" ("tenantId", "receivedAt");

-- Windowed inbox recent-contacts groupBy (inbox.repository.ts) — existing
-- (tenantId, toPhone/kind, sentAt) indexes cannot reach the sentAt range.
CREATE INDEX IF NOT EXISTS "OutboundMessage_tenantId_sentAt_idx"
  ON "messaging"."OutboundMessage" ("tenantId", "sentAt");

-- Twilio SMS status callback recipient lookup (blasts.service.ts).
CREATE INDEX IF NOT EXISTS "BlastRecipient_twilioMessageSid_idx"
  ON "messaging"."BlastRecipient" ("twilioMessageSid");

-- P2P initial-send claim: blastId= + status='PENDING' + assigneeId IS NULL
-- ORDER BY createdAt FOR UPDATE SKIP LOCKED (texting.service.ts).
CREATE INDEX IF NOT EXISTS "BlastRecipient_blastId_status_assigneeId_createdAt_idx"
  ON "messaging"."BlastRecipient" ("blastId", "status", "assigneeId", "createdAt");

-- Opt-out ledger list/groupBy/count (compliance.service.ts).
CREATE INDEX IF NOT EXISTS "ContactConsent_tenantId_state_updatedAt_idx"
  ON "messaging"."ContactConsent" ("tenantId", "state", "updatedAt");

-- Inbox conversation list sort (inbox.repository.ts).
CREATE INDEX IF NOT EXISTS "ConversationState_tenantId_updatedAt_idx"
  ON "messaging"."ConversationState" ("tenantId", "updatedAt");

-- Scheduled-dispatch cron sweep (blasts.service.ts).
CREATE INDEX IF NOT EXISTS "Blast_status_scheduledFor_idx"
  ON "messaging"."Blast" ("status", "scheduledFor");

-- ── audience ─────────────────────────────────────────────────────────────────
-- Audience membership list/export/growth ordered by createdAt.
CREATE INDEX IF NOT EXISTS "AudienceContact_audienceId_createdAt_idx"
  ON "audience"."AudienceContact" ("audienceId", "createdAt");

-- Cross-tenant import dispatch sweep (audiences.service.ts).
CREATE INDEX IF NOT EXISTS "AudienceImport_status_createdAt_idx"
  ON "audience"."AudienceImport" ("status", "createdAt");

-- ── analytics ────────────────────────────────────────────────────────────────
-- engagementTrend per-blast series + Blast SetNull FK probe.
CREATE INDEX IF NOT EXISTS "AnalyticsSnapshot_blastId_bucketAt_idx"
  ON "analytics"."AnalyticsSnapshot" ("blastId", "bucketAt");

-- ── journey ──────────────────────────────────────────────────────────────────
-- Cross-tenant wait-sweep cron (journeys.service.ts).
CREATE INDEX IF NOT EXISTS "JourneyEnrolment_state_resumeAt_idx"
  ON "journey"."JourneyEnrolment" ("state", "resumeAt");

-- Contact delete cascade probe + per-contact journey reads.
CREATE INDEX IF NOT EXISTS "JourneyEnrolment_contactId_idx"
  ON "journey"."JourneyEnrolment" ("contactId");

-- ── integration ──────────────────────────────────────────────────────────────
-- Delivery-ledger default listing + health summary (crm-push.service.ts).
CREATE INDEX IF NOT EXISTS "IntegrationPushDelivery_tenantId_createdAt_idx"
  ON "integration"."IntegrationPushDelivery" ("tenantId", "createdAt");

-- Connection sync history + connection-delete cascade probe.
CREATE INDEX IF NOT EXISTS "IntegrationSyncJob_integrationConnectionId_createdAt_idx"
  ON "integration"."IntegrationSyncJob" ("integrationConnectionId", "createdAt");

-- ── payment ──────────────────────────────────────────────────────────────────
-- Invoice list per tenant (payment.service.ts) — table has no tenant index today.
CREATE INDEX IF NOT EXISTS "Invoice_tenantId_createdAt_idx"
  ON "payment"."Invoice" ("tenantId", "createdAt");

-- ── telephony ────────────────────────────────────────────────────────────────
-- Cross-tenant live-call reconciliation sweep (calls.service.ts).
CREATE INDEX IF NOT EXISTS "Call_status_createdAt_idx"
  ON "telephony"."Call" ("status", "createdAt");

-- ── autodialer ───────────────────────────────────────────────────────────────
-- Campaign attempt list + today-count (dialer-reporting.service.ts).
CREATE INDEX IF NOT EXISTS "DialerAttempt_campaignId_createdAt_idx"
  ON "autodialer"."DialerAttempt" ("campaignId", "createdAt");

-- Telephony-mirror reaction OR-lookup on targetCallId (autodialer.reactions.ts).
CREATE INDEX IF NOT EXISTS "DialerCallSession_targetCallId_idx"
  ON "autodialer"."DialerCallSession" ("targetCallId");
