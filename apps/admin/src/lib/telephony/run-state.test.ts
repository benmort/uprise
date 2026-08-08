import { describe, expect, it } from "vitest";
import { isRunLive, isRunSettled, needsAttention } from "./run-state";

// Every status the provisioning state machine can park a run in.
const IN_FLIGHT = [
  "REQUESTED",
  "SUBACCOUNT_CREATED",
  "COMPLIANCE_DRAFT",
  "COMPLIANCE_SUBMITTED",
  "COMPLIANCE_APPROVED",
  "NUMBER_PURCHASED",
  "WEBHOOKS_CONFIGURED",
];

describe("isRunSettled", () => {
  /**
   * THE regression. COMPLIANCE_REJECTED is Twilio knocking back the organisation's regulatory
   * bundle, and the state machine only allows it to move on by a human hand (→ COMPLIANCE_DRAFT
   * to resubmit, or → FAILED). Counting it as in-flight polled a dead run every five seconds
   * forever AND kept the warning banner and the provisioning CTA hidden, so the organisation saw
   * a busy-looking run, no error, and no way forward.
   */
  it("counts COMPLIANCE_REJECTED as settled", () => {
    expect(isRunSettled("COMPLIANCE_REJECTED")).toBe(true);
    expect(isRunLive("COMPLIANCE_REJECTED")).toBe(false);
  });

  it("counts the two obvious ends as settled", () => {
    expect(isRunSettled("ACTIVE")).toBe(true);
    expect(isRunSettled("FAILED")).toBe(true);
  });

  it("leaves every genuinely in-flight status live", () => {
    for (const status of IN_FLIGHT) {
      expect(isRunSettled(status), `${status} should still be live`).toBe(false);
      expect(isRunLive(status), `${status} should still be live`).toBe(true);
    }
  });

  it("does not treat a missing status as a live run", () => {
    // No run at all must not start a 5s poll loop.
    expect(isRunLive(null)).toBe(false);
    expect(isRunLive(undefined)).toBe(false);
    expect(isRunLive("")).toBe(false);
  });
});

describe("needsAttention", () => {
  it("flags the two states a person has to act on", () => {
    expect(needsAttention("FAILED")).toBe(true);
    expect(needsAttention("COMPLIANCE_REJECTED")).toBe(true);
  });

  it("does not flag success or work in progress", () => {
    expect(needsAttention("ACTIVE")).toBe(false);
    for (const status of IN_FLIGHT) expect(needsAttention(status)).toBe(false);
  });
});
