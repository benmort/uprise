import { describe, expect, it } from "vitest";
import type { ChannelSetupStep, SetupStep, TenantSetupState } from "@uprise/api-client";
import { stepCardStatus } from "./card-status";

const step = (key: string, status: SetupStep["status"]): SetupStep => ({ key: key as SetupStep["key"], status });

function state(over: {
  identity?: SetupStep[];
  account?: SetupStep[];
  org?: SetupStep[] | null; // null → not applicable (an organiser)
  channels?: ChannelSetupStep[] | null;
} = {}): TenantSetupState {
  return {
    flows: {
      identity: { steps: over.identity ?? [step("verifyEmail", "done")], complete: true },
      account: { steps: over.account ?? [step("branding", "recommended")], complete: false },
      organisation: {
        applicable: over.org !== null,
        steps: over.org ?? [step("orgIdentity", "done"), step("businessLegal", "todo")],
        complete: false,
      },
      channels: { applicable: over.channels !== null, steps: over.channels ?? [], complete: true },
    },
    gates: { canProvisionTelephony: { allowed: true }, canRequestEmail: { allowed: true } },
    dismissed: false,
    updatedAt: null,
  };
}

describe("stepCardStatus", () => {
  it("maps done → DONE and todo → TODO", () => {
    const s = state();
    expect(stepCardStatus(s, "orgIdentity")).toBe("DONE");
    expect(stepCardStatus(s, "businessLegal")).toBe("TODO");
  });

  it("maps the server's 'recommended' onto the card's OPTIONAL chip", () => {
    expect(stepCardStatus(state(), "branding")).toBe("OPTIONAL");
    expect(stepCardStatus(state({ account: [step("brandAssets", "recommended")] }), "brandAssets")).toBe(
      "OPTIONAL",
    );
  });

  it("finds a key in any flow, not just the organisation one", () => {
    expect(stepCardStatus(state(), "verifyEmail")).toBe("DONE");
  });

  it("returns undefined before the state loads, so a card renders no chip rather than a wrong one", () => {
    expect(stepCardStatus(undefined, "orgIdentity")).toBeUndefined();
  });

  it("returns undefined for a step this principal doesn't get (organiser: no org flow)", () => {
    expect(stepCardStatus(state({ org: null }), "orgIdentity")).toBeUndefined();
    expect(stepCardStatus(state(), "address")).toBeUndefined();
  });
});
