/**
 * Is a provisioning run still moving on its own?
 *
 * The card polls while a run is "live" and, while it thinks so, hides both the
 * "mobile numbers can't place outbound calls" warning and the provisioning CTA — reasonably,
 * since a run in progress is about to resolve that.
 *
 * The old set was `{ACTIVE, FAILED}`, so every other status counted as in-flight — including
 * COMPLIANCE_REJECTED, which is Twilio telling the organisation its regulatory bundle was
 * knocked back. Nothing moves a rejected run: the state machine only allows
 * COMPLIANCE_REJECTED → COMPLIANCE_DRAFT (edit and resubmit) or → FAILED, both human actions.
 * So the card polled a dead run every five seconds indefinitely and, worse, kept the warning and
 * the CTA hidden the whole time — the organisation saw a run that looked busy, was told nothing
 * had gone wrong, and had no route forward.
 *
 * "Settled" is the honest question: not "did it succeed" but "will it change without a person".
 */
const SETTLED = new Set(["ACTIVE", "FAILED", "COMPLIANCE_REJECTED"]);

/** A run that will not progress without a person. Stop polling; show the situation. */
export function isRunSettled(status: string | null | undefined): boolean {
  return SETTLED.has(String(status ?? ""));
}

/** A run still working through the automation. */
export function isRunLive(status: string | null | undefined): boolean {
  return Boolean(status) && !isRunSettled(status);
}

/**
 * Settled BADLY — the organisation has to do something. FAILED offers resume; COMPLIANCE_REJECTED
 * needs the bundle edited and resubmitted. Callers use this to decide whether to surface a route
 * forward rather than a bare status chip.
 */
export function needsAttention(status: string | null | undefined): boolean {
  return status === "FAILED" || status === "COMPLIANCE_REJECTED";
}
