import { IntegrationPushStatus } from "@uprise/db";
import { assertPushDeliveryTransition, canTransitionPushDelivery } from "./integration-push-state.machine";

const S = IntegrationPushStatus;

describe("integration push delivery FSM", () => {
  it("walks the happy path", () => {
    expect(canTransitionPushDelivery(S.PENDING, S.SENDING)).toBe(true);
    expect(canTransitionPushDelivery(S.SENDING, S.SUCCEEDED)).toBe(true);
  });

  it("parks and releases via the circuit breaker", () => {
    expect(canTransitionPushDelivery(S.PENDING, S.HELD)).toBe(true);
    expect(canTransitionPushDelivery(S.SENDING, S.HELD)).toBe(true);
    expect(canTransitionPushDelivery(S.HELD, S.PENDING)).toBe(true);
  });

  it("lets a retryable send fall back to PENDING and a manual retry revive FAILED", () => {
    expect(canTransitionPushDelivery(S.SENDING, S.PENDING)).toBe(true);
    expect(canTransitionPushDelivery(S.FAILED, S.PENDING)).toBe(true);
  });

  it("terminal states stay terminal — a replayed job is a no-op, never a rewrite", () => {
    expect(canTransitionPushDelivery(S.SUCCEEDED, S.SENDING)).toBe(false);
    expect(canTransitionPushDelivery(S.SKIPPED, S.PENDING)).toBe(false);
    expect(canTransitionPushDelivery(S.SUCCEEDED, S.FAILED)).toBe(false);
  });

  it("the command-path guard throws a 409 on an illegal move", () => {
    // ApiHttpException carries its text in the response envelope, not error.message —
    // assert the throw + status rather than the string.
    try {
      assertPushDeliveryTransition(S.SUCCEEDED, S.PENDING);
      fail("expected an illegal transition to throw");
    } catch (error: any) {
      expect(error.getStatus?.()).toBe(409);
    }
    expect(() => assertPushDeliveryTransition(S.FAILED, S.PENDING)).not.toThrow();
  });
});
