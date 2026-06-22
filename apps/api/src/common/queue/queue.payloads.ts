export type AudienceImportBatchJobPayload = {
  importId: string;
  requestedBatchSize?: number;
};

export type BlastSendBatchJobPayload = {
  blastId: string;
  requestedBatchSize?: number;
};

export type BlastRetryFailedJobPayload = {
  blastId: string;
};

export type IntegrationSyncJobPayload = {
  syncJobId: string;
  type: "ACTION_NETWORK" | "INTERNAL";
  listId: string;
  audienceName: string;
  listName?: string;
  query?: string;
  cursorUrl?: string;
  run?: number;
};

export type JourneyRunRungJobPayload = {
  enrolmentId: string;
  rungIndex: number;
};

export type SegmentEvalRunJobPayload = {
  segmentId: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isAudienceImportBatchJobPayload(
  value: unknown,
): value is AudienceImportBatchJobPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (!isNonEmptyString(payload.importId)) return false;
  if (payload.requestedBatchSize === undefined) return true;
  return Number.isFinite(payload.requestedBatchSize);
}

export function isBlastSendBatchJobPayload(value: unknown): value is BlastSendBatchJobPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (!isNonEmptyString(payload.blastId)) return false;
  if (payload.requestedBatchSize === undefined) return true;
  return Number.isFinite(payload.requestedBatchSize);
}

export function isBlastRetryFailedJobPayload(value: unknown): value is BlastRetryFailedJobPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return isNonEmptyString(payload.blastId);
}

export function isJourneyRunRungJobPayload(value: unknown): value is JourneyRunRungJobPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (!isNonEmptyString(payload.enrolmentId)) return false;
  return Number.isFinite(payload.rungIndex);
}

export function isSegmentEvalRunJobPayload(value: unknown): value is SegmentEvalRunJobPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return isNonEmptyString(payload.segmentId);
}

export function isIntegrationSyncJobPayload(value: unknown): value is IntegrationSyncJobPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (!isNonEmptyString(payload.syncJobId)) return false;
  if (!isNonEmptyString(payload.listId)) return false;
  if (!isNonEmptyString(payload.audienceName)) return false;
  if (payload.type !== "ACTION_NETWORK" && payload.type !== "INTERNAL") return false;
  if (payload.listName !== undefined && typeof payload.listName !== "string") return false;
  if (payload.query !== undefined && typeof payload.query !== "string") return false;
  if (payload.cursorUrl !== undefined && typeof payload.cursorUrl !== "string") return false;
  if (payload.run !== undefined && !Number.isFinite(payload.run)) return false;
  return true;
}
