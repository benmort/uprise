export const QUEUE_NAMES = {
  AUDIENCE_IMPORT: "audience-import",
  BLAST_SEND: "blast-send",
  BLAST_RETRY: "blast-retry",
  INTEGRATION_SYNC: "integration-sync",
  JOURNEY_RUN: "journey-run",
  DOMAIN_EVENTS: "domain-events",
} as const;

export const QUEUE_JOB_TYPES = {
  AUDIENCE_IMPORT_BATCH: "audience.import.batch",
  BLAST_SEND_BATCH: "blast.send.batch",
  BLAST_RETRY_FAILED: "blast.retry.failed",
  INTEGRATION_SYNC_LIST: "integration.sync.list",
  JOURNEY_RUN_RUNG: "journey.run.rung",
  DOMAIN_EVENT: "domain.event",
} as const;

export function getAudienceImportJobId(importId: string, chunkKey?: string): string {
  return chunkKey ? `audience-import_${importId}_${chunkKey}` : `audience-import_${importId}`;
}

export function getBlastSendJobId(blastId: string, chunkKey?: string): string {
  return chunkKey ? `blast-send_${blastId}_${chunkKey}` : `blast-send_${blastId}`;
}

export function getBlastRetryJobId(blastId: string): string {
  return `blast-retry_${blastId}`;
}

export function getIntegrationSyncJobId(syncJobId: string, chunkKey?: string): string {
  return chunkKey
    ? `integration-sync_${syncJobId}_${chunkKey}`
    : `integration-sync_${syncJobId}`;
}

export function getJourneyRungJobId(enrolmentId: string, rungIndex: number): string {
  return `journey-run_${enrolmentId}_${rungIndex}`;
}
