export enum BlastStatus {
  DRAFTED = "DRAFTED",
  PROOFED = "PROOFED",
  SCHEDULED = "SCHEDULED",
  SENDING = "SENDING",
  SENT = "SENT",
  FAILED = "FAILED",
}

export enum BlastRecipientStatus {
  PENDING = "PENDING",
  QUEUED = "QUEUED",
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  RESPONDED = "RESPONDED",
  FAILED = "FAILED",
  SKIPPED = "SKIPPED",
}

export enum AudienceStatus {
  ACTIVE = "ACTIVE",
  ARCHIVED = "ARCHIVED",
}

export enum AudienceSource {
  MANUAL = "MANUAL",
  CSV = "CSV",
  ACTION_NETWORK = "ACTION_NETWORK",
  INTERNAL = "INTERNAL",
}

export enum IntegrationType {
  ACTION_NETWORK = "ACTION_NETWORK",
  INTERNAL = "INTERNAL",
}

export enum IntegrationConnectionStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

export enum IntegrationJobStatus {
  QUEUED = "QUEUED",
  RUNNING = "RUNNING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
}
