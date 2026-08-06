import { IntegrationPushStatus } from "@uprise/db";
import { ApiHttpException } from "../common/http/api-response";

/**
 * Lifecycle of one CRM push delivery (the ledger row, not the BullMQ job):
 *
 *   PENDING ──▶ SENDING ──▶ SUCCEEDED
 *      │           │  └────▶ FAILED ──▶ PENDING (manual retry)
 *      │           └───────▶ PENDING (retryable error — BullMQ backs off and re-runs)
 *      ├─────────▶ SKIPPED  (stream off / no identity / consent gate / cancelled)
 *      └─────────▶ HELD     (connection not ACTIVE — circuit breaker)
 *   HELD ────────▶ PENDING  (connection reactivated; the sweep releases it)
 *
 * Two entry points on purpose: the WORKER path uses the non-throwing `canTransition`
 * (at-least-once delivery legitimately replays a terminal row — that's a no-op, not an
 * error), while the COMMAND path (manual retry) uses the throwing guard so an illegal
 * request surfaces as a 409 instead of silently doing nothing.
 */
const TRANSITIONS: Record<IntegrationPushStatus, IntegrationPushStatus[]> = {
  [IntegrationPushStatus.PENDING]: [
    IntegrationPushStatus.SENDING,
    IntegrationPushStatus.SKIPPED,
    IntegrationPushStatus.HELD,
  ],
  [IntegrationPushStatus.SENDING]: [
    IntegrationPushStatus.SUCCEEDED,
    IntegrationPushStatus.FAILED,
    IntegrationPushStatus.SKIPPED,
    IntegrationPushStatus.HELD,
    IntegrationPushStatus.PENDING,
  ],
  [IntegrationPushStatus.HELD]: [IntegrationPushStatus.PENDING, IntegrationPushStatus.SKIPPED],
  [IntegrationPushStatus.FAILED]: [IntegrationPushStatus.PENDING],
  [IntegrationPushStatus.SUCCEEDED]: [],
  [IntegrationPushStatus.SKIPPED]: [],
};

export function canTransitionPushDelivery(
  from: IntegrationPushStatus,
  to: IntegrationPushStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertPushDeliveryTransition(
  from: IntegrationPushStatus,
  to: IntegrationPushStatus,
): void {
  if (!canTransitionPushDelivery(from, to)) {
    throw new ApiHttpException(
      "INVALID_PUSH_TRANSITION",
      `A ${from} delivery cannot move to ${to}`,
      409,
    );
  }
}
