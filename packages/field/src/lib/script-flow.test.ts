import { describe, expect, it } from "vitest";
import { branchFor, branchSteps, openerStep, type ScriptStepLike } from "./script-flow";

const steps: ScriptStepLike[] = [
  { bodyText: "Refused reply", outcomeKey: "refused", orderIndex: 2 },
  { bodyText: "Hi, I'm door-knocking for…", orderIndex: 0 },
  { bodyText: "Great to hear! Can we count on you?", outcomeKey: "spoke_to_target", orderIndex: 1 },
];

describe("script-flow", () => {
  it("picks the opener (the step without an outcome key)", () => {
    expect(openerStep(steps)?.bodyText).toMatch(/door-knocking/);
  });

  it("falls back to the first step when every step is keyed", () => {
    const keyed = [{ bodyText: "only", outcomeKey: "x", orderIndex: 0 }];
    expect(openerStep(keyed)?.bodyText).toBe("only");
    expect(openerStep([])).toBeNull();
  });

  it("returns branches in order, excluding the opener", () => {
    expect(branchSteps(steps).map((s) => s.outcomeKey)).toEqual(["spoke_to_target", "refused"]);
  });

  it("resolves the branch talk-track for a disposition code", () => {
    expect(branchFor(steps, "refused")?.bodyText).toBe("Refused reply");
    expect(branchFor(steps, "not_home")).toBeNull();
    expect(branchFor(steps, null)).toBeNull();
  });
});
