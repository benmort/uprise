export const QUEUE_NAMES = {
  AUDIENCE_IMPORT: "audience-import",
  BLAST_SEND: "blast-send",
  BLAST_RETRY: "blast-retry",
  INTEGRATION_SYNC: "integration-sync",
} as const;

export const QUEUE_JOB_TYPES = {
  AUDIENCE_IMPORT_BATCH: "audience.import.batch",
  BLAST_SEND_BATCH: "blast.send.batch",
  BLAST_RETRY_FAILED: "blast.retry.failed",
  INTEGRATION_SYNC_LIST: "integration.sync.list",
} as const;

export function getAudienceImportJobId(importId: string, chunkKey?: string): string {
  return chunkKey ? `audience-import:${importId}:${chunkKey}` : `audience-import:${importId}`;
}

export function getBlastSendJobId(blastId: string, chunkKey?: string): string {
  return chunkKey ? `blast-send:${blastId}:${chunkKey}` : `blast-send:${blastId}`;
}

export function getBlastRetryJobId(blastId: string): string {
  return `blast-retry:${blastId}`;
}

export function getIntegrationSyncJobId(syncJobId: string, chunkKey?: string): string {
  return chunkKey
    ? `integration-sync:${syncJobId}:${chunkKey}`
    : `integration-sync:${syncJobId}`;
}
