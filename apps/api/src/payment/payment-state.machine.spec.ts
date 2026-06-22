import { PaymentStatus } from "@yarns/db";
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
  ])("allows %s → %s", (from, to) => {
    expect(() => assertValidPaymentTransition(from, to)).not.toThrow();
  });

  it.each([
    [PaymentStatus.RECORDED, PaymentStatus.REFUNDED],
    [PaymentStatus.SUCCEEDED, PaymentStatus.PROCESSING],
    [PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.PARTIALLY_REFUNDED], // prog: no second non-completing partial
    [PaymentStatus.FAILED, PaymentStatus.SUCCEEDED],
    [PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED],
  ])("rejects %s → %s", (from, to) => {
    expect(() => assertValidPaymentTransition(from, to)).toThrow();
  });
});
