import type { PushDeliveryRecord, PushDeliveryStatus, SyncStreamKey } from "@uprise/api-client";

/**
 * Pure helpers behind the Sync activity card — what each push stream is called, how a
 * delivery reads as a badge/summary/error line, and when a connection's push health
 * counts as failing. Framework-free so they sit in the vitest lib coverage scope.
 */

/** Organiser-facing names for the per-connection stream toggles. */
export const STREAM_LABELS: Record<SyncStreamKey, string> = {
  dispositions: "Door-knock outcomes",
  surveyAnswers: "Survey answers",
  tags: "Tags",
  textReplies: "Text replies",
  rsvps: "RSVPs",
};

/** Labels for the log's `stream` column (the delivery rows use the api's stream keys). */
export const DELIVERY_STREAM_LABELS: Record<string, string> = {
  disposition: "Door-knock outcome",
  survey: "Survey answer",
  tag: "Tag",
  opt_out: "Opt-out",
  text_reply: "Text reply",
  rsvp: "RSVP",
};

/** Map a delivery status onto the StatusBadge vocabulary. */
export function deriveDeliveryBadge(status: PushDeliveryStatus): string {
  switch (status) {
    case "SUCCEEDED":
      return "SENT";
    case "FAILED":
      return "FAILED";
    case "SKIPPED":
      return "SKIPPED";
    case "HELD":
      return "ON HOLD";
    case "SENDING":
    case "PENDING":
    default:
      return "QUEUED";
  }
}

/** Only a FAILED delivery is manually retryable (the FSM 409s anything else). */
export function canRetryDelivery(row: Pick<PushDeliveryRecord, "status">): boolean {
  return row.status === "FAILED";
}

/** "Door-knock outcome" / "Tag" … with an unknown stream humanised, never leaked raw. */
export function summariseDelivery(row: Pick<PushDeliveryRecord, "stream">): string {
  if (DELIVERY_STREAM_LABELS[row.stream]) return DELIVERY_STREAM_LABELS[row.stream];
  const cleaned = String(row.stream ?? "").replace(/[_-]+/g, " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Update";
}

const SKIP_REASON_LABELS: Record<string, string> = {
  stream_disabled: "Stream turned off",
  no_person_match: "Not in NationBuilder",
  source_row_gone: "The record was removed in uprise",
  source_event_gone: "The originating event expired",
  opt_out_superseded: "They opted back in before it sent",
  empty_answer: "Nothing to send",
  stream_not_implemented: "Not supported yet",
};

/** Why a delivery failed/was skipped, in one organiser-readable line. */
export function describeDeliveryError(
  row: Pick<PushDeliveryRecord, "status" | "skipReason" | "lastError">,
): string {
  if (row.status === "SKIPPED" && row.skipReason) {
    return SKIP_REASON_LABELS[row.skipReason] ?? row.skipReason.replace(/[_-]+/g, " ");
  }
  if (row.status === "HELD") {
    return row.lastError || "Waiting for the connection to be reconnected";
  }
  if (row.lastError) {
    // lastError may be a raw provider string — first line, bounded.
    return row.lastError.split("\n")[0].slice(0, 160);
  }
  return "";
}

/** A connection is FAILING when its recent window holds any FAILED or HELD deliveries. */
export function connectionPushHealth(
  summary: Partial<Record<PushDeliveryStatus, number>> | undefined,
): "OK" | "FAILING" | "IDLE" {
  if (!summary) return "IDLE";
  const failed = (summary.FAILED ?? 0) + (summary.HELD ?? 0);
  if (failed > 0) return "FAILING";
  const any = Object.values(summary).reduce((n, v) => n + (v ?? 0), 0);
  return any > 0 ? "OK" : "IDLE";
}

/** Total failed+held across every connection — drives the surface-level warning banner. */
export function totalFailedDeliveries(
  byConnection: Record<string, Partial<Record<PushDeliveryStatus, number>>> | undefined,
): number {
  if (!byConnection) return 0;
  return Object.values(byConnection).reduce(
    (n, s) => n + (s.FAILED ?? 0) + (s.HELD ?? 0),
    0,
  );
}
