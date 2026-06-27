import { CallStatus } from "@uprise/db";
import { assertTransition, type TransitionMap } from "../common/fsm/assert-transition";

/**
 * Call FSM (meld doc 09) — faithful port of prog's call.aggregate STATUS_TRANSITIONS.
 * INITIATED → RINGING → IN_PROGRESS → COMPLETED; the terminal failure states
 * (BUSY, NO_ANSWER, FAILED) are reachable from the earlier non-terminal states.
 * A status callback that replays a terminal transition is an idempotent no-op
 * (callers gate on canTransitionCall).
 */
export const CALL_TRANSITIONS: TransitionMap<CallStatus> = {
  [CallStatus.INITIATED]: [
    CallStatus.RINGING,
    CallStatus.IN_PROGRESS,
    CallStatus.COMPLETED,
    CallStatus.BUSY,
    CallStatus.NO_ANSWER,
    CallStatus.FAILED,
  ],
  [CallStatus.RINGING]: [
    CallStatus.IN_PROGRESS,
    CallStatus.COMPLETED,
    CallStatus.BUSY,
    CallStatus.NO_ANSWER,
    CallStatus.FAILED,
  ],
  [CallStatus.IN_PROGRESS]: [CallStatus.COMPLETED, CallStatus.FAILED],
  [CallStatus.COMPLETED]: [],
  [CallStatus.BUSY]: [],
  [CallStatus.NO_ANSWER]: [],
  [CallStatus.FAILED]: [],
};

export function assertValidCallTransition(from: CallStatus, to: CallStatus): void {
  assertTransition(CALL_TRANSITIONS, from, to, "INVALID_CALL_TRANSITION", "call");
}

export function canTransitionCall(from: CallStatus, to: CallStatus): boolean {
  return CALL_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Twilio CallStatus → our CallStatus. Unknown/non-transitional → null (no-op). */
export function mapTwilioCallStatus(raw: string): CallStatus | null {
  switch (raw) {
    case "ringing":
      return CallStatus.RINGING;
    case "in-progress":
      return CallStatus.IN_PROGRESS;
    case "completed":
      return CallStatus.COMPLETED;
    case "busy":
      return CallStatus.BUSY;
    case "no-answer":
      return CallStatus.NO_ANSWER;
    case "failed":
    case "canceled":
      return CallStatus.FAILED;
    default:
      return null; // queued / initiated — nothing to transition.
  }
}
