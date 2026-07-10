export const QUEUE_NAMES = {
  AUDIENCE_IMPORT: "audience-import",
  BLAST_SEND: "blast-send",
  BLAST_RETRY: "blast-retry",
  INTEGRATION_SYNC: "integration-sync",
  JOURNEY_RUN: "journey-run",
  DOMAIN_EVENTS: "domain-events",
  SEGMENT_EVAL: "segment-eval",
  TURF_ESTIMATE: "turf-estimate",
} as const;

export const QUEUE_JOB_TYPES = {
  AUDIENCE_IMPORT_BATCH: "audience.import.batch",
  BLAST_SEND_BATCH: "blast.send.batch",
  BLAST_RETRY_FAILED: "blast.retry.failed",
  INTEGRATION_SYNC_LIST: "integration.sync.list",
  JOURNEY_RUN_RUNG: "journey.run.rung",
  DOMAIN_EVENT: "domain.event",
  SEGMENT_EVAL_RUN: "segment.eval.run",
  TURF_ESTIMATE_RUN: "turf.estimate.run",
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

export function getSegmentEvalJobId(segmentId: string): string {
  return `segment-eval_${segmentId}`;
}

/**
 * Stable per-turf id, so the two enqueues a cut fires — one when the polygon is saved, one
 * when its doors are loaded — collapse into a single run.
 *
 * The job is enqueued with `removeOnComplete: true` on purpose. The default keeps the last
 * thousand completed jobs, and `enqueue` skips any id it can still find: with the default, a
 * re-cut of the same turf would find its own finished job and never re-price.
 */
export function getTurfEstimateJobId(turfId: string): string {
  return `turf-estimate_${turfId}`;
}
