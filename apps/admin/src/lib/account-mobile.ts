/**
 * Which number the account card should show as "your mobile".
 *
 * A user carries two, and they are not the same thing:
 *
 *   `phone`  – free text typed into the profile. Never verified, may be a landline.
 *   `mobile` – the number proved through an OTP round trip.
 *
 * Reading `mobile` alone showed people "Verified" and "No mobile on file." at once, so the card
 * was changed to prefer `phone`. That fixed the empty state and introduced a worse one: when a
 * mobile IS verified, the card put the UNVERIFIED free-text number under the Verified chip and
 * pointed the verify CTA at it. Someone who typed a landline into their profile and verified a
 * real mobile saw the landline labelled as verified.
 *
 * The precedence depends on what the chip is claiming:
 *
 *   verified   → show `mobile`, the number the claim is actually about.
 *   unverified → show whatever they have, since the card is inviting them to verify it.
 */
export function resolveAccountMobile(input: {
  phone?: string | null;
  mobile?: string | null;
  mobileVerified?: boolean;
}): string | null {
  const phone = input.phone?.trim() || null;
  const mobile = input.mobile?.trim() || null;
  return input.mobileVerified ? (mobile ?? phone) : (phone ?? mobile);
}

/**
 * Is the number on screen the one that was actually verified?
 *
 * False when a verified user's profile free-text differs from their verified mobile — the card
 * uses this to avoid implying the displayed number carries the verification.
 */
export function isDisplayedMobileVerified(input: {
  phone?: string | null;
  mobile?: string | null;
  mobileVerified?: boolean;
}): boolean {
  if (!input.mobileVerified) return false;
  const shown = resolveAccountMobile(input);
  const mobile = input.mobile?.trim() || null;
  return Boolean(shown && mobile && shown === mobile);
}
