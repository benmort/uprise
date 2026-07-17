import { ShiftAssignmentStatus } from "@uprise/db";
import { ApiHttpException } from "../common/http/api-response";

/**
 * Shift-assignment lifecycle guard — the sibling of the turf FSM.
 *
 * A volunteer self-signup on an approval-required campaign lands REQUESTED; an
 * organiser promotes it to ASSIGNED (approve) or RELEASED (deny). An ASSIGNED
 * seat can only move to RELEASED (organiser release, or the volunteer drops out).
 * RELEASED is terminal.
 *
 * The one-active-seat-per-volunteer-per-shift invariant is enforced separately by
 * the DB partial unique index (`ShiftAssignment_one_active_per_volunteer`,
 * status = 'ASSIGNED'); this guards the per-row status transition so no code
 * branches on status ad hoc.
 */
const TRANSITIONS: Record<ShiftAssignmentStatus, ShiftAssignmentStatus[]> = {
  [ShiftAssignmentStatus.REQUESTED]: [ShiftAssignmentStatus.ASSIGNED, ShiftAssignmentStatus.RELEASED],
  [ShiftAssignmentStatus.ASSIGNED]: [ShiftAssignmentStatus.RELEASED],
  [ShiftAssignmentStatus.RELEASED]: [],
};

export function canTransitionShiftAssignment(
  from: ShiftAssignmentStatus,
  to: ShiftAssignmentStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throws `INVALID_SHIFT_TRANSITION` (409) if the move isn't allowed. */
export function assertShiftAssignmentTransition(
  from: ShiftAssignmentStatus,
  to: ShiftAssignmentStatus,
): void {
  if (!canTransitionShiftAssignment(from, to)) {
    throw new ApiHttpException(
      "INVALID_SHIFT_TRANSITION",
      `Cannot move a shift assignment from ${from} to ${to}`,
    );
  }
}
