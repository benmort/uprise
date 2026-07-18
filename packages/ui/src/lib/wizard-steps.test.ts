import { describe, expect, it } from "vitest";
import { furthestReachableStep } from "./wizard-steps";

describe("furthestReachableStep", () => {
  it("stops at the first incomplete step", () => {
    expect(furthestReachableStep([true, false, false])).toBe(1);
    expect(furthestReachableStep([false, false, false])).toBe(0);
  });
  it("reaches the last step when every step is complete", () => {
    expect(furthestReachableStep([true, true, true])).toBe(2);
  });
  it("is safe for an empty flow", () => {
    expect(furthestReachableStep([])).toBe(0);
  });
});
