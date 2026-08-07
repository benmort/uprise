import { describe, expect, it } from "vitest";
import { cooldownLabel, cooldownSeconds } from "./resend-cooldown";

describe("cooldownSeconds", () => {
  it("passes a sensible duration through", () => {
    expect(cooldownSeconds(30)).toBe(30);
    expect(cooldownSeconds(0)).toBe(0);
  });

  it("clamps nonsense rather than producing an unusable button", () => {
    expect(cooldownSeconds(-5)).toBe(0);
    expect(cooldownSeconds(99_999)).toBe(600);
    expect(cooldownSeconds(Number.NaN)).toBe(30);
    expect(cooldownSeconds(12.7)).toBe(12);
  });
});

describe("cooldownLabel", () => {
  // The countdown REPLACES the label: a greyed-out "Resend" says you cannot, but not when you can.
  it("counts down while waiting", () => {
    expect(cooldownLabel(12)).toBe("Resend in 12s");
    expect(cooldownLabel(1)).toBe("Resend in 1s");
  });

  it("shows the idle label once the wait is over", () => {
    expect(cooldownLabel(0)).toBe("Resend");
    expect(cooldownLabel(0, "Send code")).toBe("Send code");
    expect(cooldownLabel(-1, "Send Proof")).toBe("Send Proof");
  });

  it("keeps the countdown wording regardless of the idle label", () => {
    expect(cooldownLabel(5, "Send Proof")).toBe("Resend in 5s");
  });
});
