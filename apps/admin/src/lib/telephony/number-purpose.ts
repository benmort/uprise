/**
 * What a phone number is FOR, in the admin app.
 *
 * Mirrors `apps/api/src/telephony/number-purpose.ts`. Provisioning stamps `purpose: "voice"` for a
 * local number and `TelephonySenderResolver` matches calls on `"voice"` — but the nickname DTO and
 * this UI could only express `"transactional"`. So a freshly provisioned calls number never showed
 * up on the calls card (which then offered to provision one the tenant already had), and
 * repurposing a number from the UI wrote a value the resolver ignored.
 *
 * "transactional" survives as a legacy alias because real rows carry it.
 */

export type NumberPurpose = "voice" | "marketing" | "whatsapp";

/** Is this the number outbound CALLS originate from? Accepts either spelling. */
export function isVoicePurpose(purpose: string | null | undefined): boolean {
  const value = (purpose ?? "").trim().toLowerCase();
  return value === "voice" || value === "transactional";
}
