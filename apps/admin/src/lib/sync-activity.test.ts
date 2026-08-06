import { describe, expect, it } from "vitest";
import {
  canRetryDelivery,
  connectionPushHealth,
  deriveDeliveryBadge,
  describeDeliveryError,
  STREAM_LABELS,
  summariseDelivery,
  totalFailedDeliveries,
} from "./sync-activity";

describe("deriveDeliveryBadge", () => {
  it("maps each ledger status onto the badge vocabulary", () => {
    expect(deriveDeliveryBadge("SUCCEEDED")).toBe("SENT");
    expect(deriveDeliveryBadge("FAILED")).toBe("FAILED");
    expect(deriveDeliveryBadge("SKIPPED")).toBe("SKIPPED");
    expect(deriveDeliveryBadge("HELD")).toBe("ON HOLD");
    expect(deriveDeliveryBadge("PENDING")).toBe("QUEUED");
    expect(deriveDeliveryBadge("SENDING")).toBe("QUEUED");
  });
});

describe("canRetryDelivery", () => {
  it("only FAILED is retryable — the FSM 409s everything else", () => {
    expect(canRetryDelivery({ status: "FAILED" })).toBe(true);
    expect(canRetryDelivery({ status: "SUCCEEDED" })).toBe(false);
    expect(canRetryDelivery({ status: "HELD" })).toBe(false);
  });
});

describe("summariseDelivery", () => {
  it("labels the known streams and humanises unknown ones", () => {
    expect(summariseDelivery({ stream: "disposition" })).toBe("Door-knock outcome");
    expect(summariseDelivery({ stream: "opt_out" })).toBe("Opt-out");
    expect(summariseDelivery({ stream: "future_thing" })).toBe("Future thing");
  });
});

describe("describeDeliveryError", () => {
  it("translates skip reasons into organiser language", () => {
    expect(describeDeliveryError({ status: "SKIPPED", skipReason: "no_person_match", lastError: null })).toBe(
      "Not in NationBuilder",
    );
    expect(
      describeDeliveryError({ status: "SKIPPED", skipReason: "opt_out_superseded", lastError: null }),
    ).toBe("They opted back in before it sent");
  });

  it("HELD explains the circuit breaker even without a stored error", () => {
    expect(describeDeliveryError({ status: "HELD", skipReason: null, lastError: null })).toMatch(/reconnected/);
  });

  it("bounds a raw provider error to its first line", () => {
    const raw = "502 Bad Gateway from nationbuilder\nstack line 2";
    expect(describeDeliveryError({ status: "FAILED", skipReason: null, lastError: raw })).toBe(
      "502 Bad Gateway from nationbuilder",
    );
  });

  it("is empty for a clean success", () => {
    expect(describeDeliveryError({ status: "SUCCEEDED", skipReason: null, lastError: null })).toBe("");
  });
});

describe("connectionPushHealth / totalFailedDeliveries", () => {
  it("FAILING on any failed or held; OK on pure success; IDLE on silence", () => {
    expect(connectionPushHealth({ SUCCEEDED: 10 })).toBe("OK");
    expect(connectionPushHealth({ SUCCEEDED: 10, FAILED: 1 })).toBe("FAILING");
    expect(connectionPushHealth({ HELD: 3 })).toBe("FAILING");
    expect(connectionPushHealth({})).toBe("IDLE");
    expect(connectionPushHealth(undefined)).toBe("IDLE");
  });

  it("totals failed+held across connections for the banner", () => {
    expect(
      totalFailedDeliveries({ c1: { FAILED: 2 }, c2: { HELD: 1, SUCCEEDED: 40 } }),
    ).toBe(3);
    expect(totalFailedDeliveries(undefined)).toBe(0);
  });
});

describe("STREAM_LABELS", () => {
  it("covers every toggleable stream", () => {
    expect(Object.keys(STREAM_LABELS).sort()).toEqual(
      ["dispositions", "rsvps", "surveyAnswers", "tags", "textReplies"].sort(),
    );
  });
});
