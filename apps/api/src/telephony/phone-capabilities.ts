/**
 * AU number-capability rules. An AU mobile long code (+614xx xxx xxx) is
 * SMS-capable but is NOT a permitted outbound-voice caller ID on uprise —
 * every voice path (token, REST initiate, browser dial-out) enforces this via
 * one predicate so the rule can never drift between paths.
 */
export const isAuMobile = (e164: string | null | undefined): boolean =>
  typeof e164 === "string" && /^\+614/.test(e164.trim());

/** True when the number may be used as an outbound-voice caller ID. */
export const isVoiceCapable = (e164: string | null | undefined): boolean =>
  !!e164 && !isAuMobile(e164);
