/**
 * The one vocabulary for what a phone number is FOR.
 *
 * Provisioning stamps `purpose: numberType === "local" ? "voice" : "marketing"`
 * (telephony-provisioning.service.ts, both the purchase and adoption paths), and
 * `TelephonySenderResolver` matches a call with `ctx.purpose === "voice"`. But the nickname DTO
 * and the api-client could only express `"transactional"`, and the calls card read that too. The
 * two halves therefore never met: a freshly provisioned local number was stamped "voice", the
 * calls page looked for "transactional" and found nothing, and repurposing a number through the
 * UI wrote a value the resolver ignored.
 *
 * "transactional" is kept as a legacy alias — it is on real rows and older clients still send it —
 * and folded into "voice" here so there is exactly one value downstream.
 */

export const NUMBER_PURPOSES = ["voice", "marketing", "whatsapp"] as const;
export type NumberPurpose = (typeof NUMBER_PURPOSES)[number];

/** What older clients and pre-existing rows may carry. */
export type NumberPurposeInput = NumberPurpose | "transactional";

/** Fold any accepted spelling onto the canonical one. Unknown input stays unset. */
export function normalisePurpose(input: string | null | undefined): NumberPurpose | undefined {
  const value = (input ?? "").trim().toLowerCase();
  if (value === "transactional" || value === "voice") return "voice";
  if (value === "marketing") return "marketing";
  if (value === "whatsapp") return "whatsapp";
  return undefined;
}

/**
 * Is this the number outbound CALLS originate from?
 *
 * Accepts either spelling, so a row stamped before the vocabulary was unified still resolves.
 */
export function isVoicePurpose(purpose: string | null | undefined): boolean {
  return normalisePurpose(purpose) === "voice";
}
