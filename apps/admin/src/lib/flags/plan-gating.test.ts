import { describe, it, expect } from "vitest";
import { FLAG_META, type FeatureFlagKey, type FeatureFlagMap } from "@uprise/flags";
import { planVisible, planLocked } from "./plan-gating";

// Derive real flag keys from the metadata so the test tracks the actual flag catalogue.
const KEYS = Object.keys(FLAG_META) as FeatureFlagKey[];
const PLAN_KEY = KEYS.find((k) => FLAG_META[k].controllableBy?.includes("plan"));
const NON_PLAN_KEY = KEYS.find((k) => !FLAG_META[k].controllableBy?.includes("plan"));
const flags = (o: Partial<Record<FeatureFlagKey, boolean>> = {}): FeatureFlagMap => o as FeatureFlagMap;

describe("planVisible", () => {
  it("is always visible with no flag", () => {
    expect(planVisible(flags(), false, undefined)).toBe(true);
  });
  it("is visible to a super-admin even when the flag is off", () => {
    const k = PLAN_KEY ?? KEYS[0];
    expect(planVisible(flags({ [k]: false }), true, k)).toBe(true);
  });
  it("is visible when the flag is unset or on for a non-super-admin", () => {
    const k = KEYS[0];
    expect(planVisible(flags(), false, k)).toBe(true); // undefined ≠ false → visible
    expect(planVisible(flags({ [k]: true }), false, k)).toBe(true);
  });
  it("is hidden when the flag is explicitly off for a non-super-admin", () => {
    const k = KEYS[0];
    expect(planVisible(flags({ [k]: false }), false, k)).toBe(false);
  });
});

describe("planLocked", () => {
  it("locks a plan-controllable, flag-off capability for a super-admin", () => {
    expect(PLAN_KEY).toBeDefined();
    expect(planLocked(flags({ [PLAN_KEY!]: false }), true, PLAN_KEY!)).toBe(true);
  });
  it("does not lock a non-plan-controllable flag", () => {
    expect(NON_PLAN_KEY).toBeDefined();
    expect(planLocked(flags({ [NON_PLAN_KEY!]: false }), true, NON_PLAN_KEY!)).toBe(false);
  });
  it("does not lock for a non-super-admin, nor when the flag is on, nor with no flag", () => {
    if (PLAN_KEY) {
      expect(planLocked(flags({ [PLAN_KEY]: false }), false, PLAN_KEY)).toBe(false);
      expect(planLocked(flags({ [PLAN_KEY]: true }), true, PLAN_KEY)).toBe(false);
    }
    expect(planLocked(flags(), true, undefined)).toBe(false);
  });
});
