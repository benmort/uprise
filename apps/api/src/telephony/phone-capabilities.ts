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

/**
 * Can this PROVISIONED number originate voice? The mirror of the sender resolver's
 * `isSmsCapable`, and the reason a tenant buys two numbers: an AU local
 * (+612/3/7/8) is the voice caller ID, an AU mobile (+614) is the SMS sender and
 * is never a caller ID.
 *
 * `numberType` is authoritative – it records the regulation class the number was
 * actually provisioned under, so a stored class must never be overridden by a guess
 * about the prefix. The prefix is consulted ONLY when the class is absent, i.e. a row
 * written before that column existed (the migration back-fills from the same prefix,
 * so in practice there are none).
 */
export const isVoiceNumber = (n: {
  numberType?: string | null;
  phoneNumberE164: string;
}): boolean => (n.numberType ? n.numberType === "local" : isVoiceCapable(n.phoneNumberE164));
