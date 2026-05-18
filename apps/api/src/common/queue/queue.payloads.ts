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
