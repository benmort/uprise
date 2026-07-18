import type { TransactionalCall } from "@uprise/api-client";

/**
 * Human-readable text for the Twilio voice error codes we actually see, used when
 * the provider sends a code without a message (or a message written for their
 * console, not an organiser). Unlisted codes fall back to "Error <code>".
 */
const TWILIO_VOICE_ERRORS: Record<string, string> = {
  "13224": "This number can't be called",
  "13225": "Number blocked by the carrier",
  "13227": "No calling permission for this destination's region",
  "20404": "Call not found at the provider",
  "21210": "Caller ID isn't verified for this account",
  "21211": "Invalid destination number",
  "21212": "Invalid caller ID",
  "21214": "Destination number can't be reached",
  "21215": "Account can't call this region (geo permissions)",
  "21216": "Calls to this number are blocked",
  "21217": "Destination number isn't reachable",
  "31003": "Connection timed out before the call could start",
  "31005": "Connection error with the voice gateway",
};

/** One-line failure reason for a call row: provider message, else our dictionary, else the raw code. */
export function callErrorText(call: Pick<TransactionalCall, "errorMessage" | "errorCode">): string | null {
  if (call.errorMessage) return call.errorMessage;
  if (!call.errorCode) return null;
  return TWILIO_VOICE_ERRORS[call.errorCode] ?? `Error ${call.errorCode}`;
}

/** Full detail for the hover title: message · code · SIP. */
export function callErrorTitle(
  call: Pick<TransactionalCall, "errorMessage" | "errorCode" | "sipCode">,
): string | undefined {
  const parts = [
    call.errorMessage || (call.errorCode ? TWILIO_VOICE_ERRORS[call.errorCode] : null),
    call.errorCode && `code ${call.errorCode}`,
    call.sipCode && `SIP ${call.sipCode}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}
