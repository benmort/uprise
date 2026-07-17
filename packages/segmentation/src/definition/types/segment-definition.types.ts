/**
 * The stored segment specification (ported from slingshot's SegmentDefinition /
 * MailingPolicy v2, adapted to uprise's audiences framework).
 *
 * In uprise the definition lives on `AudienceSegment.definition` (jsonb) as the
 * **v2 envelope** `{ format: 2, filter, policy, customClauses? }` — legacy
 * definitions carry no `format` key and keep evaluating via the legacy clause
 * evaluator. Evaluating a definition in a context **produces** an audience — it
 * is not the audience (membership is materialised separately).
 */
import type { FilterNode } from "./filter.types";

/**
 * Layer-2 policy — a self-contained value object of operator-configured rules.
 * Held on the definition; Layer-3 compliance is NOT stored here (it composes
 * fresh at evaluation). Kept structurally in sync with `SegmentPolicySchema`
 * (the Zod schema is the runtime authority).
 */
export interface SegmentPolicy {
  /** Rolling-window fatigue — per-contact blast-send cap. */
  fatigue: {
    enabled: boolean;
    /** Positive integer window in hours. */
    windowHours: number;
    /** Send-count cap: ≥ this many sends in-window excludes the contact. */
    maxSends: number;
  };
  /**
   * The Layer-2 active-only clause — the recency `predicate` embedded **by
   * value** (injected from the org default at creation), applied when `enabled`.
   * The predicate is present even when disabled (inert, ready to enable).
   */
  isActive: {
    enabled: boolean;
    predicate: FilterNode;
  };
}

/**
 * An AI custom clause held on the envelope (the SQL lane). The `predicate` is a
 * validated WHERE fragment over the masked `contacts_safe` view — re-validated
 * on EVERY evaluation before execution, never trusted from storage. Referenced
 * from the tree by a `custom.clause` leaf via `id`.
 */
export interface SegmentCustomClause {
  id: string;
  /** Short human label shown in the builder lane. */
  label: string;
  /** The plain-English intent the predicate was compiled from. */
  intent: string;
  /** The compiled SQL predicate (validated at save AND at every evaluation). */
  predicate: string;
}

/** The v2 definition envelope stored in `AudienceSegment.definition`. */
export interface SegmentDefinitionV2 {
  format: 2;
  /** Layer-1 intent. */
  filter: FilterNode;
  /** Layer-2 policy. */
  policy: SegmentPolicy;
  /** AI custom clauses referenced by `custom.clause` leaves. */
  customClauses?: SegmentCustomClause[];
}

/**
 * The default Layer-2 active predicate embedded by value at creation — "active
 * in the last 365 days" over the cross-source activity verb. A governed org
 * default (editable per-tenant) is a later story; v1 injects this constant.
 */
export const DEFAULT_IS_ACTIVE_PREDICATE: FilterNode = {
  kind: "condition",
  condition: { type: "activity.lastActiveWithin", op: "within", days: 365 },
};

/** The default policy a new segment starts with (fatigue off, isActive off but armed). */
export const DEFAULT_SEGMENT_POLICY: SegmentPolicy = {
  fatigue: { enabled: false, windowHours: 72, maxSends: 3 },
  isActive: { enabled: false, predicate: DEFAULT_IS_ACTIVE_PREDICATE },
};
