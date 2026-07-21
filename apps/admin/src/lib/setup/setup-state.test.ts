import { describe, expect, it } from "vitest";
import type { ChannelSetupStep, SetupStep, TenantSetupState } from "@uprise/api-client";
import {
  attentionKeys,
  chipStatus,
  flowProgress,
  nextStep,
  overallProgress,
  setupComplete,
  shouldResurface,
} from "./setup-state";

const step = (key: string, status: SetupStep["status"]): SetupStep => ({ key: key as SetupStep["key"], status });
const channel = (key: string, state: ChannelSetupStep["state"], over: Partial<ChannelSetupStep> = {}): ChannelSetupStep => ({
  key: key as ChannelSetupStep["key"],
  status: state === "active" ? "done" : "todo",
  state,
  planLocked: false,
  reason: null,
  ...over,
});

function state(over: {
  identity?: SetupStep[];
  identityComplete?: boolean;
  account?: SetupStep[];
  org?: SetupStep[] | null; // null → not applicable
  orgComplete?: boolean;
  channels?: ChannelSetupStep[] | null;
  channelsComplete?: boolean;
} = {}): TenantSetupState {
  return {
    flows: {
      identity: {
        steps: over.identity ?? [step("verifyEmail", "done"), step("confirmMobile", "done")],
        complete: over.identityComplete ?? true,
      },
      account: { steps: over.account ?? [step("enableTwofa", "recommended")], complete: false },
      organisation: {
        applicable: over.org !== null,
        steps: over.org ?? [step("orgIdentity", "done")],
        complete: over.orgComplete ?? true,
      },
      channels: {
        applicable: over.channels !== null,
        steps: over.channels ?? [channel("phoneNumber", "active")],
        complete: over.channelsComplete ?? true,
      },
    },
    gates: { canProvisionTelephony: { allowed: true }, canRequestEmail: { allowed: true } },
    dismissed: false,
    updatedAt: null,
  };
}

describe("flowProgress / overallProgress", () => {
  it("counts done over countable steps, excluding plan-locked channels", () => {
    const steps = [
      channel("phoneNumber", "active"),
      channel("emailIdentity", "none", { planLocked: true }),
    ];
    expect(flowProgress(steps)).toEqual({ done: 1, total: 1 });
  });

  it("recommended steps count in the denominator (actionable polish)", () => {
    expect(flowProgress([step("verifyEmail", "done"), step("enableTwofa", "recommended")])).toEqual({
      done: 1,
      total: 2,
    });
  });

  it("overallProgress counts identity + organisation only — account/channels are extras", () => {
    const s = state({
      identity: [step("verifyEmail", "todo"), step("confirmMobile", "done")],
      account: [step("enableTwofa", "recommended"), step("completeProfile", "recommended")],
      org: [step("businessLegal", "todo")],
      channels: [channel("phoneNumber", "none")],
    });
    // identity 1/2 + organisation 0/1; account (2) and channels (1) excluded.
    expect(overallProgress(s)).toEqual({ done: 1, total: 3 });
  });

  it("overallProgress skips non-applicable flows (organiser: identity only)", () => {
    const s = state({ identity: [step("verifyEmail", "todo"), step("confirmMobile", "todo")], org: null, channels: null });
    expect(overallProgress(s)).toEqual({ done: 0, total: 2 });
  });
});

describe("setupComplete", () => {
  it("combines identity + applicable org/channel complete flags; account never blocks", () => {
    expect(setupComplete(state())).toBe(true);
    expect(setupComplete(state({ identityComplete: false }))).toBe(false);
    expect(setupComplete(state({ orgComplete: false }))).toBe(false);
    // Account flow incomplete by default in the factory — still complete overall.
    expect(setupComplete(state({ account: [step("enableTwofa", "recommended")] }))).toBe(true);
  });

  it("ignores non-applicable flows", () => {
    expect(setupComplete(state({ org: null, channels: null, identityComplete: true }))).toBe(true);
  });
});

describe("nextStep", () => {
  it("returns the first attention step in flow order", () => {
    const s = state({
      identity: [step("verifyEmail", "done"), step("confirmMobile", "done")],
      org: [step("orgIdentity", "done"), step("businessLegal", "todo")],
      channels: [channel("phoneNumber", "none")],
    });
    expect(nextStep(s)).toMatchObject({ flow: "organisation", step: { key: "businessLegal" } });
  });

  it("skips in-flight, requested, recommended and plan-locked steps", () => {
    const s = state({
      identity: [step("verifyEmail", "done"), step("confirmMobile", "done")],
      account: [step("enableTwofa", "recommended")],
      org: [step("orgIdentity", "done")],
      channels: [
        channel("phoneNumber", "in_progress"),
        channel("emailIdentity", "requested"),
      ],
    });
    expect(nextStep(s)).toBeNull();
  });
});

describe("chipStatus", () => {
  it("maps plain steps", () => {
    expect(chipStatus(step("verifyEmail", "done"))).toBe("DONE");
    expect(chipStatus(step("verifyEmail", "todo"))).toBe("TODO");
    expect(chipStatus(step("enableTwofa", "recommended"))).toBe("RECOMMENDED");
  });

  it("maps channel steps with planLocked winning", () => {
    expect(chipStatus(channel("phoneNumber", "active"))).toBe("DONE");
    expect(chipStatus(channel("phoneNumber", "requested"))).toBe("REQUESTED");
    expect(chipStatus(channel("phoneNumber", "in_progress"))).toBe("IN_PROGRESS");
    expect(chipStatus(channel("phoneNumber", "action_required"))).toBe("ACTION_REQUIRED");
    expect(chipStatus(channel("phoneNumber", "failed"))).toBe("FAILED");
    expect(chipStatus(channel("phoneNumber", "none"))).toBe("TODO");
    expect(chipStatus(channel("phoneNumber", "active", { planLocked: true }))).toBe("PLAN_LOCKED");
  });
});

describe("dismiss / resurface", () => {
  it("no snapshot → surfaces", () => {
    expect(shouldResurface(null, state())).toBe(true);
  });

  it("stays dismissed while the attention set is unchanged or shrinking", () => {
    const s = state({ org: [step("businessLegal", "todo")], orgComplete: false });
    const snap = { at: "2026-07-21T00:00:00Z", attention: attentionKeys(s) };
    expect(shouldResurface(snap, s)).toBe(false);
    // Step completed → fewer attention keys → stays dismissed.
    expect(shouldResurface(snap, state())).toBe(false);
  });

  it("resurfaces when a NEW step needs attention (compliance rejection)", () => {
    const dismissedWith = state({ channels: [channel("phoneNumber", "in_progress")], channelsComplete: false });
    const snap = { at: "2026-07-21T00:00:00Z", attention: attentionKeys(dismissedWith) };
    const regressed = state({ channels: [channel("phoneNumber", "action_required")], channelsComplete: false });
    expect(shouldResurface(snap, regressed)).toBe(true);
  });
});
