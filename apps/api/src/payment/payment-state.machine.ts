import { PaymentStatus } from "@yarns/db";
import { assertTransition, type TransitionMap } from "../common/fsm/assert-transition";

// Based on prog's payment aggregate, with one deliberate deviation: prog forbade
// partially_refunded → partially_refunded, but Stripe supports unlimited partial
// refunds, so a real second partial would deadlock. We allow the self-transition
// (a non-completing partial) and reserve → refunded for the completing one.
export const PAYMENT_TRANSITIONS: TransitionMap<PaymentStatus> = {
  [PaymentStatus.RECORDED]: [PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED, PaymentStatus.FAILED],
  [PaymentStatus.PROCESSING]: [PaymentStatus.SUCCEEDED, PaymentStatus.FAILED],
  [PaymentStatus.SUCCEEDED]: [PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED],
  [PaymentStatus.PARTIALLY_REFUNDED]: [PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.REFUNDED]: [],
};

export function assertValidPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  assertTransition(PAYMENT_TRANSITIONS, from, to, "INVALID_PAYMENT_TRANSITION", "payment");
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}
