import { describe, expect, it } from "vitest";
import { getFailedRecipientCount, getLastActionLabel } from "./recipient-activity";

describe("getFailedRecipientCount", () => {
  /**
   * The blast-level retry names this number in its label. The control it replaced was a "Retry"
   * button sitting inside one recipient's row that actually re-sent to EVERY failed recipient —
   * real money and real messages, with nothing on screen admitting the scope.
   */
  it("totals the FAILED bucket from the status roll-up", () => {
    expect(
      getFailedRecipientCount([
        { status: "SENT", _count: 1500 },
        { status: "FAILED", _count: 475 },
        { status: "SKIPPED", _count: 12 },
      ]),
    ).toBe(475);
  });

  it("is zero when nothing has failed, so the action can hide itself", () => {
    expect(getFailedRecipientCount([{ status: "SENT", _count: 1500 }])).toBe(0);
    expect(getFailedRecipientCount([])).toBe(0);
    expect(getFailedRecipientCount(null)).toBe(0);
    expect(getFailedRecipientCount(undefined)).toBe(0);
  });

  // Never render "NaN failed recipients" on a control that sends messages.
  it("ignores malformed rows rather than producing NaN", () => {
    expect(getFailedRecipientCount([{ status: "FAILED", _count: "many" }])).toBe(0);
    expect(getFailedRecipientCount([{ status: "FAILED" }])).toBe(0);
    expect(
      getFailedRecipientCount([{ status: "FAILED", _count: 3 }, { status: "FAILED", _count: 4 }]),
    ).toBe(7);
  });
});

describe("getLastActionLabel", () => {
  /**
   * THE regression. Anything not FAILED or SKIPPED fell through to "Message Sent", so a blast
   * still in flight reported recipients as contacted before anything had been sent to them — on
   * exactly the screen an organiser watches to judge progress.
   */
  it("does not claim a not-yet-sent recipient was messaged", () => {
    expect(getLastActionLabel({ status: "PENDING" })).toBe("Not sent yet");
    expect(getLastActionLabel({ status: "QUEUED" })).toBe("Not sent yet");
  });

  it("names the failure category when there is one", () => {
    expect(getLastActionLabel({ status: "FAILED", failureCategory: "Invalid number" })).toBe(
      "Invalid number",
    );
    expect(getLastActionLabel({ status: "FAILED" })).toBe("Failed");
  });

  it("reports a skip as a skip", () => {
    expect(getLastActionLabel({ status: "SKIPPED" })).toBe("Skipped");
  });

  it("reports a genuine send as sent", () => {
    expect(getLastActionLabel({ status: "SENT" })).toBe("Message Sent");
    expect(getLastActionLabel({ status: "DELIVERED" })).toBe("Message Sent");
  });

  it("survives a missing row", () => {
    expect(getLastActionLabel(null)).toBe("Message Sent");
    expect(getLastActionLabel({})).toBe("Message Sent");
  });
});
