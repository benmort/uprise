/**
 * The 3-layer composition (ported from slingshot SEG-0006) — assemble the
 * **effective tree** `all( L1 intent, L2 policy, L3 compliance )` from a
 * definition's `filter` (L1) + `policy` (L2) and a context, with
 * **context-determined requiredness**.
 *
 * - **L1 intent** — the definition's `filter`, annotated `editable` (the only
 *   editable layer). Always applied (intent is mandatory).
 * - **L2 policy** — the fatigue mechanic leaf plus, when enabled, the
 *   definition's own embedded `isActive.predicate` inlined as read-only
 *   policy-layer conditions. Sending contexts: default-on, so it follows the
 *   policy values (the operator overrides by toggling them off). List/export:
 *   optional (opt-in).
 * - **L3 compliance** — the safety floor for the blast channel: channel consent
 *   + suppression + reachability. Sending contexts: **mandatory +
 *   non-bypassable** (always applied, never removable). List/export: optional.
 *
 * This composes the **structure** only — the mechanic leaves are stubs resolved
 * against live data at **evaluation**. No evaluation, no data access here.
 */
import type { ComplianceChannel, Condition } from "../definition/types/condition.types";
import type { FilterNode } from "../definition/types/filter.types";
import type { SegmentPolicy } from "../definition/types/segment-definition.types";
import { getContextLayerStack, type SegmentationContext } from "./context-model";
import type {
  ComposedAudience,
  EffectiveConditionNode,
  EffectiveGroupNode,
  EffectiveNode,
} from "./effective-tree";

/** The L1 + L2 source for a composition — a saved definition or an inline preview spec. */
export interface CompositionSource {
  /** Layer-1 intent. */
  filter: FilterNode;
  /** Layer-2 policy. */
  policy: SegmentPolicy;
}

/**
 * Opt-ins for contexts where a layer is **optional** (list/export). Ignored
 * where the layer is mandatory or default-on — in particular `applyCompliance`
 * can never disable a sending context's mandatory L3 floor.
 */
export interface ComposeOptions {
  /** The blast channel the L3 floor is built for. Default SMS. */
  channel?: ComplianceChannel;
  /** Apply Layer-2 policy where it is optional (list/export). Default: off. */
  applyPolicy?: boolean;
  /** Apply Layer-3 compliance where it is optional (list/export). Default: off. */
  applyCompliance?: boolean;
}

/**
 * The Layer-3 compliance floor for a channel — `all( channelConsent,
 * notSuppressed, reachable )`. Every leaf is resolved against live data by the
 * evaluator's compliance resolvers. This floor is a safety invariant of every
 * sending evaluation (never drop a leaf).
 */
export const complianceFloorConditions = (channel: ComplianceChannel): readonly Condition[] => [
  { type: "compliance.channelConsent", channel },
  { type: "compliance.notSuppressed", channel },
  { type: "compliance.reachable", channel },
];

/** Annotate a stored {@link FilterNode} as the editable L1 intent subtree. */
const toIntentNode = (node: FilterNode): EffectiveNode => {
  if (node.kind === "condition") {
    return { kind: "condition", layer: "intent", editable: true, condition: node.condition };
  }
  // Bounded depth (save validation caps depth at MAX_FILTER_DEPTH); a plain tree map.
  return {
    kind: node.kind,
    layer: "intent",
    editable: true,
    children: node.children.map(toIntentNode),
  };
};

/** Annotate a stored {@link FilterNode} as the read-only Layer-2 policy subtree. */
const toPolicyNode = (node: FilterNode): EffectiveNode => {
  if (node.kind === "condition") {
    return { kind: "condition", layer: "policy", editable: false, condition: node.condition };
  }
  return {
    kind: node.kind,
    layer: "policy",
    editable: false,
    children: node.children.map(toPolicyNode),
  };
};

/**
 * Build the Layer-2 policy subtree from the policy values — a read-only
 * `all(...)` of the fatigue mechanic leaf (still a stub, resolved at
 * evaluation) plus, when `isActive.enabled`, the definition's **own embedded
 * `isActive.predicate`** inlined as a policy-layer condition subtree: no
 * eval-time provider lookup — the evaluator resolves it exactly as it resolves
 * authored recency conditions. Returns `null` when both are off (the
 * "overridable" half of default-on).
 */
const buildPolicyLayer = (policy: SegmentPolicy): EffectiveGroupNode | null => {
  const leaves: EffectiveNode[] = [];
  if (policy.fatigue.enabled) {
    leaves.push({
      kind: "mechanic",
      layer: "policy",
      editable: false,
      stub: true,
      mechanic: "fatigue",
      windowHours: policy.fatigue.windowHours,
      maxSends: policy.fatigue.maxSends,
    });
  }
  if (policy.isActive.enabled) {
    leaves.push(toPolicyNode(policy.isActive.predicate));
  }
  if (leaves.length === 0) return null;
  return { kind: "all", layer: "policy", editable: false, children: leaves };
};

/**
 * Build the Layer-3 compliance subtree — the read-only safety floor for the
 * channel. Always non-empty.
 */
export const buildComplianceLayer = (channel: ComplianceChannel): EffectiveGroupNode => {
  const conditions: EffectiveConditionNode[] = complianceFloorConditions(channel).map(
    (condition) => ({
      kind: "condition",
      layer: "compliance",
      editable: false,
      condition,
    }),
  );
  return { kind: "all", layer: "compliance", editable: false, children: conditions };
};

/**
 * Compose the effective tree for a definition in a context.
 *
 * Requiredness is read from the context's layer stack:
 * - intent — always applied;
 * - policy — applied per the policy values when the context's L2 is `mandatory`
 *   / `default-on` (sending); applied only on `applyPolicy` when `optional`;
 * - compliance — **always** applied when mandatory (sending, non-bypassable,
 *   options cannot disable it); applied only on `applyCompliance` when optional.
 */
export const composeEffectiveTree = (
  source: CompositionSource,
  context: SegmentationContext,
  options: ComposeOptions = {},
): ComposedAudience => {
  const stack = getContextLayerStack(context);
  const channel = options.channel ?? "SMS";
  const children: EffectiveNode[] = [];

  // L1 — intent is always mandatory.
  children.push(toIntentNode(source.filter));

  // L2 — default-on/mandatory follow the policy values; optional requires opt-in.
  const policyInForce = stack.layers.policy === "optional" ? options.applyPolicy === true : true;
  let policyApplied = false;
  if (policyInForce) {
    const policyLayer = buildPolicyLayer(source.policy);
    if (policyLayer) {
      children.push(policyLayer);
      policyApplied = true;
    }
  }

  // L3 — mandatory compliance is non-bypassable (options cannot disable it); optional requires opt-in.
  const complianceInForce =
    stack.layers.compliance === "mandatory" ? true : options.applyCompliance === true;
  let complianceApplied = false;
  if (complianceInForce) {
    children.push(buildComplianceLayer(channel));
    complianceApplied = true;
  }

  const tree: EffectiveGroupNode = { kind: "all", layer: "composition", editable: false, children };

  return {
    context,
    stack,
    applied: { intent: true, policy: policyApplied, compliance: complianceApplied },
    tree,
  };
};
