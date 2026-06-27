import { PaymentStatus } from "@uprise/db";
import { assertValidPaymentTransition } from "./payment-state.machine";

describe("payment state machine", () => {
  it.each([
    [PaymentStatus.RECORDED, PaymentStatus.PROCESSING],
    [PaymentStatus.RECORDED, PaymentStatus.SUCCEEDED],
    [PaymentStatus.RECORDED, PaymentStatus.FAILED],
    [PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED],
    [PaymentStatus.PROCESSING, PaymentStatus.FAILED],
    [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED],
    [PaymentStatus.SUCCEEDED, PaymentStatus.PARTIALLY_REFUNDED],
    [PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED],
    // Stripe supports unlimited partial refunds, so a second non-completing
    // partial is allowed (deliberate deviation from prog's stricter FSM).
    [PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.PARTIALLY_REFUNDED],
  ])("allows %s → %s", (from, to) => {
    expect(() => assertValidPaymentTransition(from, to)).not.toThrow();
  });

  it.each([
    [PaymentStatus.RECORDED, PaymentStatus.REFUNDED],
    [PaymentStatus.SUCCEEDED, PaymentStatus.PROCESSING],
    [PaymentStatus.FAILED, PaymentStatus.SUCCEEDED],
    [PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED],
  ])("rejects %s → %s", (from, to) => {
    expect(() => assertValidPaymentTransition(from, to)).toThrow();
  });
});
