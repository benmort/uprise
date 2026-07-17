/**
 * The effective-tree shape (ported from slingshot SEG-0006) — the composed,
 * annotated `all(L1, L2, L3)` the admin UI renders for **transparency**:
 * Layer-1 editable, Layer-2 + Layer-3 read-only, all in one shared vocabulary.
 *
 * Mirrors the {@link FilterNode} shape (`all` / `any` / `none` groups + leaves),
 * but every node is annotated with the {@link CompositionLayer} it belongs to
 * and a per-node `editable` flag. Leaves are one of:
 *
 * - a **catalogue {@link Condition}** — used for L1 intent, the inlined L2
 *   active predicate, and the L3 compliance floor; or
 * - a **mechanic leaf** — a policy mechanic *not* expressible as a catalogue
 *   attribute (fatigue). These are **stubs**: their structure is composed here,
 *   but they are resolved against live data (blast send history) only at
 *   evaluation.
 */
import type { Condition } from "../definition/types/condition.types";
import type { ContextLayerStack, SegmentationContext } from "./context-model";

/**
 * The layer an effective-tree node belongs to. `composition` tags the root
 * combiner (`all(...)` of the applied layers); the rest map to the three
 * authority layers (`intent` = L1, `policy` = L2, `compliance` = L3).
 */
export const COMPOSITION_LAYERS = ["composition", "intent", "policy", "compliance"] as const;
export type CompositionLayer = (typeof COMPOSITION_LAYERS)[number];

/**
 * A policy mechanic that is **not** a catalogue attribute and so cannot be
 * expressed as a {@link Condition}:
 * - `fatigue` (L2) — exclude contacts blasted within a rolling window.
 * Each is a **stub** here; the real predicate is resolved at evaluation.
 *
 * (Slingshot's `sameContextDedup` mechanic is not ported — uprise blasts dedupe
 * per-blast via the `@@unique([blastId, phoneE164])` recipient constraint.)
 */
export const SEGMENT_MECHANICS = ["fatigue"] as const;
export type SegmentMechanic = (typeof SEGMENT_MECHANICS)[number];

/** Annotation carried by every effective-tree node. */
interface EffectiveNodeBase {
  layer: CompositionLayer;
  /** Only `intent` (L1) nodes are editable; policy / compliance / composition are read-only. */
  editable: boolean;
}

/** A boolean-group node (`all` → AND, `any` → OR, `none` → NOT). */
export interface EffectiveGroupNode extends EffectiveNodeBase {
  kind: "all" | "any" | "none";
  children: EffectiveNode[];
}

/** A leaf wrapping a catalogue {@link Condition}. */
export interface EffectiveConditionNode extends EffectiveNodeBase {
  kind: "condition";
  condition: Condition;
}

/**
 * A leaf for a policy **mechanic** (not a catalogue attribute). It is a stub
 * (`stub: true`): the structure is composed here; the predicate is resolved
 * against live data at evaluation. Params are carried inline, discriminated by
 * `mechanic`.
 */
export type EffectiveMechanicNode = EffectiveNodeBase & { kind: "mechanic"; stub: true } & {
  mechanic: "fatigue";
  windowHours: number;
  maxSends: number;
};

/** A node in the annotated effective tree. */
export type EffectiveNode = EffectiveGroupNode | EffectiveConditionNode | EffectiveMechanicNode;

/**
 * The output of composing a definition in a context: the annotated effective
 * tree plus the context's requiredness rules and which layers were actually
 * applied. Evaluated by the fold; rendered for transparency by the admin UI.
 */
export interface ComposedAudience {
  context: SegmentationContext;
  /** The context's requiredness rules (for the transparency UI). */
  stack: ContextLayerStack;
  /** Which layers contributed a subtree to {@link tree}. */
  applied: { intent: true; policy: boolean; compliance: boolean };
  /** The root `all(...)` composition node — `all( L1 [, L2] [, L3] )`. */
  tree: EffectiveGroupNode;
}

/** A type guard for the group node variant. */
export const isEffectiveGroup = (node: EffectiveNode): node is EffectiveGroupNode =>
  node.kind === "all" || node.kind === "any" || node.kind === "none";

/** A zeroed per-layer count. */
const zeroCounts = (): Record<CompositionLayer, number> => ({
  composition: 0,
  intent: 0,
  policy: 0,
  compliance: 0,
});

/**
 * Count nodes per layer across the effective tree (for observability — the
 * compliance count must be > 0 in sending contexts). Iterative, so it never
 * recurses or stack-overflows.
 */
export const countNodesByLayer = (root: EffectiveNode): Record<CompositionLayer, number> => {
  const counts = zeroCounts();
  const stack: EffectiveNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    counts[node.layer] += 1;
    if (isEffectiveGroup(node)) {
      for (const child of node.children) stack.push(child);
    }
  }
  return counts;
};
