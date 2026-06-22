import { PaymentStatus } from "@yarns/db";
import { assertTransition, type TransitionMap } from "../common/fsm/assert-transition";

// Faithful port of prog's payment aggregate STATUS_TRANSITIONS.
// Note: partially_refunded only → refunded (a second non-completing partial is
// rejected) — matching prog exactly.
export const PAYMENT_TRANSITIONS: TransitionMap<PaymentStatus> = {
  [PaymentStatus.RECORDED]: [PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED, PaymentStatus.FAILED],
  [PaymentStatus.PROCESSING]: [PaymentStatus.SUCCEEDED, PaymentStatus.FAILED],
  [PaymentStatus.SUCCEEDED]: [PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED],
  [PaymentStatus.PARTIALLY_REFUNDED]: [PaymentStatus.REFUNDED],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.REFUNDED]: [],
};

export function assertValidPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  assertTransition(PAYMENT_TRANSITIONS, from, to, "INVALID_PAYMENT_TRANSITION", "payment");
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}
