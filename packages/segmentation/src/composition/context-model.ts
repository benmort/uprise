/**
 * The context model (ported from slingshot SEG-0006) — per-context layer stack +
 * requiredness.
 *
 * A `context` (the consuming use-case) determines **which of the three authority
 * layers apply and how mandatory each is**. Segmentation owns and *offers* all
 * three layers regardless; requiredness is a property of the **context**, not
 * the layer:
 *
 * - **Sending contexts** (`blast` — SMS/WhatsApp blasts): Layer-3 compliance is
 *   **mandatory + non-bypassable** (you must not contact the opted-out /
 *   suppressed); Layer-2 policy is **default-on, operator-overridable**.
 * - **List / export contexts** (`list`): Layer-2 + Layer-3 are **optional** — an
 *   organiser may opt to apply them, or build straight from the conditions
 *   (e.g. *export everyone who signed*, regardless of consent state).
 *
 * v1 wires only `blast`; `list` is **declared but gated** (its stack is defined
 * here so the rules are complete and forward-compatible, but the API surface
 * refuses it until lit up).
 */

/** The consuming contexts a segment can be evaluated in. */
export const SEGMENTATION_CONTEXTS = ["blast", "list"] as const;
export type SegmentationContext = (typeof SEGMENTATION_CONTEXTS)[number];

/** The three authority layers. `intent` = L1, `policy` = L2, `compliance` = L3. */
export const SEGMENT_LAYERS = ["intent", "policy", "compliance"] as const;
export type SegmentLayer = (typeof SEGMENT_LAYERS)[number];

/**
 * How required a layer is **for a given context**:
 * - `mandatory` — always applied, cannot be removed or bypassed (L3 in sending contexts).
 * - `default-on` — applied by default, but the operator can override it off (L2 in sending contexts).
 * - `optional` — only applied when the caller opts in (L2 / L3 in list/export contexts).
 */
export const LAYER_REQUIREDNESS = ["mandatory", "default-on", "optional"] as const;
export type LayerRequiredness = (typeof LAYER_REQUIREDNESS)[number];

/**
 * The layer stack a context applies — the requiredness rule per layer plus
 * whether the context is a sending context and whether it is wired in v1.
 */
export interface ContextLayerStack {
  context: SegmentationContext;
  /** `active` = wired in v1 (`blast`); `gated` = declared, not yet served. */
  status: "active" | "gated";
  /** Sending contexts produce deliverable recipients; list/export produce a record set. */
  sending: boolean;
  layers: {
    /** The organiser's own filter — always mandatory (segmentation needs intent to draw). */
    intent: LayerRequiredness;
    policy: LayerRequiredness;
    compliance: LayerRequiredness;
  };
}

/** The per-context layer stacks (the context model). */
const CONTEXT_LAYER_STACKS: Record<SegmentationContext, ContextLayerStack> = {
  blast: {
    context: "blast",
    status: "active",
    sending: true,
    layers: { intent: "mandatory", policy: "default-on", compliance: "mandatory" },
  },
  list: {
    context: "list",
    status: "gated",
    sending: false,
    layers: { intent: "mandatory", policy: "optional", compliance: "optional" },
  },
};

/** Resolve the layer stack (requiredness rules) for a context. */
export const getContextLayerStack = (context: SegmentationContext): ContextLayerStack =>
  CONTEXT_LAYER_STACKS[context];

/** A sending context produces deliverable recipients (`blast`). */
export const isSendingContext = (context: SegmentationContext): boolean =>
  CONTEXT_LAYER_STACKS[context].sending;

/**
 * Compliance (L3) is mandatory + non-bypassable for this context. True for every
 * sending context — the safety floor that must never be removed.
 */
export const isComplianceMandatory = (context: SegmentationContext): boolean =>
  CONTEXT_LAYER_STACKS[context].layers.compliance === "mandatory";
