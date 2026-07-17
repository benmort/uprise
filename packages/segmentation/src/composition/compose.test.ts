import { describe, expect, it } from "vitest";
import type { FilterNode } from "../definition/types/filter.types";
import {
  DEFAULT_IS_ACTIVE_PREDICATE,
  DEFAULT_SEGMENT_POLICY,
  type SegmentPolicy,
} from "../definition/types/segment-definition.types";
import { composeEffectiveTree } from "./compose";
import { countNodesByLayer, isEffectiveGroup, type EffectiveNode } from "./effective-tree";

const filter: FilterNode = {
  kind: "all",
  children: [{ kind: "condition", condition: { type: "tag.tagged", op: "in", values: ["t"] } }],
};

const policyOn: SegmentPolicy = {
  fatigue: { enabled: true, windowHours: 72, maxSends: 3 },
  isActive: { enabled: true, predicate: DEFAULT_IS_ACTIVE_PREDICATE },
};

const collectTypes = (root: EffectiveNode): string[] => {
  const out: string[] = [];
  const stack: EffectiveNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (isEffectiveGroup(node)) stack.push(...node.children);
    else if (node.kind === "condition") out.push(node.condition.type);
    else out.push(`mechanic:${node.mechanic}`);
  }
  return out;
};

describe("composeEffectiveTree — blast (sending) context", () => {
  it("always applies the L3 floor for the channel, non-bypassably", () => {
    const composed = composeEffectiveTree(
      { filter, policy: DEFAULT_SEGMENT_POLICY },
      "blast",
      { channel: "WHATSAPP", applyCompliance: false }, // the opt-out must be ignored
    );
    expect(composed.applied.compliance).toBe(true);
    const types = collectTypes(composed.tree);
    expect(types).toContain("compliance.channelConsent");
    expect(types).toContain("compliance.notSuppressed");
    expect(types).toContain("compliance.reachable");
    expect(countNodesByLayer(composed.tree).compliance).toBeGreaterThan(0);
  });

  it("policy is default-on: applied when enabled, absent when all-off", () => {
    const off = composeEffectiveTree({ filter, policy: DEFAULT_SEGMENT_POLICY }, "blast", {});
    expect(off.applied.policy).toBe(false);

    const on = composeEffectiveTree({ filter, policy: policyOn }, "blast", {});
    expect(on.applied.policy).toBe(true);
    const types = collectTypes(on.tree);
    expect(types).toContain("mechanic:fatigue");
    // the embedded isActive predicate inlined as a policy-layer condition
    expect(types.filter((t) => t === "activity.lastActiveWithin")).toHaveLength(1);
  });

  it("intent nodes are editable; policy/compliance are read-only", () => {
    const composed = composeEffectiveTree({ filter, policy: policyOn }, "blast", {});
    const stack: EffectiveNode[] = [composed.tree];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.layer === "intent") expect(node.editable).toBe(true);
      if (node.layer === "policy" || node.layer === "compliance") expect(node.editable).toBe(false);
      if (isEffectiveGroup(node)) stack.push(...node.children);
    }
  });
});

describe("composeEffectiveTree — list (export) context", () => {
  it("policy + compliance are opt-in", () => {
    const bare = composeEffectiveTree({ filter, policy: policyOn }, "list", {});
    expect(bare.applied).toMatchObject({ policy: false, compliance: false });

    const optedIn = composeEffectiveTree({ filter, policy: policyOn }, "list", {
      applyPolicy: true,
      applyCompliance: true,
    });
    expect(optedIn.applied).toMatchObject({ policy: true, compliance: true });
  });
});
