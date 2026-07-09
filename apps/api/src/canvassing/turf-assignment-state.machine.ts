import { TurfAssignmentStatus } from "@uprise/db";
import { ApiHttpException } from "../common/http/api-response";

/**
 * Turf-assignment lifecycle guard (the canvass domain's first FSM).
 *
 * A volunteer self-claim on an approval-required campaign lands REQUESTED; an
 * organiser promotes it to ASSIGNED (approve) or RELEASED (deny). An ASSIGNED
 * turf can only move to RELEASED (release/unassign). RELEASED is terminal.
 *
 * The one-ASSIGNED-per-turf invariant is enforced separately by the DB partial
 * unique index (`TurfAssignment_one_active_per_turf`, status = 'ASSIGNED'); this
 * table guards the per-row status transition so no code branches on status ad hoc.
 */
const TRANSITIONS: Record<TurfAssignmentStatus, TurfAssignmentStatus[]> = {
  [TurfAssignmentStatus.REQUESTED]: [TurfAssignmentStatus.ASSIGNED, TurfAssignmentStatus.RELEASED],
  [TurfAssignmentStatus.ASSIGNED]: [TurfAssignmentStatus.RELEASED],
  [TurfAssignmentStatus.RELEASED]: [],
};

export function canTransitionTurfAssignment(
  from: TurfAssignmentStatus,
  to: TurfAssignmentStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throws `INVALID_TURF_TRANSITION` (409) if the move isn't allowed. */
export function assertTurfAssignmentTransition(
  from: TurfAssignmentStatus,
  to: TurfAssignmentStatus,
): void {
  if (!canTransitionTurfAssignment(from, to)) {
    throw new ApiHttpException(
      "INVALID_TURF_TRANSITION",
      `Cannot move a turf assignment from ${from} to ${to}`,
    );
  }
}
