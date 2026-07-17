/**
 * Live-preview shapes (adapted from slingshot's MailingAudiencePreview) — the
 * counts + masked sample the builder's preview rail renders. A preview is a
 * LIVE read that materialises nothing.
 */

/** A masked recipient row in the preview sample — no raw PII leaves the api. */
export interface MaskedRecipient {
  contactId: string;
  /** e.g. `+61•••••789` (never the full number). */
  maskedPhone: string | null;
  /** e.g. `a•••@example.org` (never the full address). */
  maskedEmail: string | null;
  /** Display name is organiser-visible data, carried unmasked. */
  name: string | null;
}

/**
 * The preview counts — each stage of the layer stack, so the builder can show
 * where contacts fall out. Identities: `matched − shaped = excludedByPolicy`;
 * `shaped − sendable = excludedByCompliance`.
 */
export interface SegmentPreview {
  /** |universe| — every contact in the tenant. */
  total: number;
  /** |fold(L1)| — the authored intent alone. */
  matched: number;
  /** |fold(L1 ∩ L2)| — after policy (fatigue / active-only). */
  shaped: number;
  /** |fold(L1 ∩ L2 ∩ L3)| — after the compliance floor: the sendable audience. */
  sendable: number;
  excludedByPolicy: number;
  excludedByCompliance: number;
  /** The head of the deterministic hash order over the sendable set. */
  sample: MaskedRecipient[];
  /** Custom-clause failures surfaced to the builder (clause id → reasons). */
  clauseErrors?: Array<{ clauseId: string; reasons: string[] }>;
}
