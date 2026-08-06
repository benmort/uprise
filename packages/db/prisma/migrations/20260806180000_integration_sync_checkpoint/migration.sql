-- IntegrationSyncJob gains a dedicated checkpoint column. The resumable-cursor JSON was
-- previously overloaded into errorSummary, so a failure overwrote the checkpoint (a retry
-- restarted the whole list) and "errorSummary" never meant what it said. The service reads
-- checkpoint ?? errorSummary so in-flight legacy rows keep resuming.
ALTER TABLE integration."IntegrationSyncJob" ADD COLUMN "checkpoint" JSONB;

-- The two lookups the table has always paid for without an index: the scheduled-refresh
-- dispatcher's "is a job already live for this audience", and getSyncJobs' per-tenant
-- newest-first listing.
CREATE INDEX IF NOT EXISTS "IntegrationSyncJob_audienceId_status_idx"
  ON integration."IntegrationSyncJob"("audienceId", "status");
CREATE INDEX IF NOT EXISTS "IntegrationSyncJob_tenantId_createdAt_idx"
  ON integration."IntegrationSyncJob"("tenantId", "createdAt");
