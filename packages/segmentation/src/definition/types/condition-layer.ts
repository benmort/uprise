/**
 * The 3-layer authoring authority (ported from slingshot SEG-0020) — the layer
 * every condition `type` belongs to, and the single derivation both the
 * save-time authority guard (`validateAuthoredFilter`) and the attribute
 * catalogue consult.
 *
 * - **L1 — authorable intent.** What an organiser may compose into their own
 *   segment filter: contact facts, tags, consent targeting, activity verbs,
 *   geo/insights, custom clauses. The ONLY authorable layer.
 * - **L2 — policy.** The `policy.*` reference leaves — policy-owned: the live
 *   active clause is the definition's embedded `isActive.predicate`, inlined as
 *   read-only policy-layer conditions at composition — never authored into L1.
 * - **L3 — compliance.** The system-applied floor: the `compliance.*` leaves
 *   (channel consent, suppression, reachability). The system composes these into
 *   every sending audience; they are never organiser-authored intent.
 *
 * Only L1 is authorable; L2 + L3 are read-only in the effective tree. The
 * classifier is a **pure function of the condition `type`** (prefix-based) — no
 * catalogue lookup — so the thin validation layer can consult it without
 * importing the catalogue, and the catalogue derives each entry's `layer` from
 * the same source.
 */

/** The authoring layer a condition belongs to. */
export const CONDITION_LAYERS = ["L1", "L2", "L3"] as const;
export type ConditionLayer = (typeof CONDITION_LAYERS)[number];

/**
 * Classify a condition `type` into its authoring layer. Every `compliance.*`
 * condition is the L3 floor; every `policy.*` condition is L2; everything else
 * (contact, tag/consent/source, activity, geo/insights, custom) is authorable L1.
 */
export const conditionLayer = (type: string): ConditionLayer => {
  if (type.startsWith("policy.")) return "L2";
  if (type.startsWith("compliance.")) return "L3";
  return "L1";
};

/** True when a condition `type` is authorable L1 intent (the only editable layer). */
export const isAuthorableLayer = (type: string): boolean => conditionLayer(type) === "L1";
