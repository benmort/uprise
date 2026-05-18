export const QUEUE_NAMES = {
  AUDIENCE_IMPORT: "audience-import",
  BLAST_SEND: "blast-send",
  BLAST_RETRY: "blast-retry",
} as const;

export const QUEUE_JOB_TYPES = {
  AUDIENCE_IMPORT_BATCH: "audience.import.batch",
  BLAST_SEND_BATCH: "blast.send.batch",
  BLAST_RETRY_FAILED: "blast.retry.failed",
} as const;

export function getAudienceImportJobId(importId: string): string {
  return `audience-import:${importId}`;
}

export function getBlastSendJobId(blastId: string): string {
  return `blast-send:${blastId}`;
}

export function getBlastRetryJobId(blastId: string): string {
  return `blast-retry:${blastId}`;
}
