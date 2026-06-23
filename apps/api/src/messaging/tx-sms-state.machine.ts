import { TxSmsStatus } from "@yarns/db";
import { assertTransition, type TransitionMap } from "../common/fsm/assert-transition";

// Mirrors prog's sms-message aggregate: pending → queued → sent → delivered |
// undelivered, with failed reachable from pending/queued/sent. Terminal states
// have no outgoing transitions (a replayed terminal callback is swallowed).
export const TX_SMS_TRANSITIONS: TransitionMap<TxSmsStatus> = {
  [TxSmsStatus.PENDING]: [TxSmsStatus.QUEUED, TxSmsStatus.FAILED],
  [TxSmsStatus.QUEUED]: [TxSmsStatus.SENT, TxSmsStatus.FAILED],
  [TxSmsStatus.SENT]: [TxSmsStatus.DELIVERED, TxSmsStatus.UNDELIVERED, TxSmsStatus.FAILED],
  [TxSmsStatus.DELIVERED]: [],
  [TxSmsStatus.UNDELIVERED]: [],
  [TxSmsStatus.FAILED]: [],
};

export function assertValidTxSmsTransition(from: TxSmsStatus, to: TxSmsStatus): void {
  assertTransition(TX_SMS_TRANSITIONS, from, to, "INVALID_TX_SMS_TRANSITION", "transactional SMS");
}

/** Non-throwing guard: is `from → to` a legal transactional-SMS transition? */
export function canTransitionTxSms(from: TxSmsStatus, to: TxSmsStatus): boolean {
  return (TX_SMS_TRANSITIONS[from] ?? []).includes(to);
}
