export type FailureScope = "INTERNAL" | "EXTERNAL";

export type ClassifiedFailure = {
  scope: FailureScope;
  code: string | null;
  category: string;
  normalizedCategory: string;
};

type FailureInput = {
  errorCode?: string | null;
  errorMessage?: string | null;
  messageStatus?: string | null;
  error?: unknown;
};

const EXTERNAL_CODE_CATEGORY: Record<string, string> = {
  "21211": "INVALID_DESTINATION",
  "21214": "UNREACHABLE_DESTINATION",
  "21217": "INVALID_DESTINATION",
  "21265": "SHORT_CODE_DESTINATION",
  "21408": "REGION_PERMISSION_BLOCK",
  "21610": "RECIPIENT_OPTOUT",
  "21612": "ROUTING_COMBINATION_BLOCK",
  "21614": "INVALID_MOBILE_DESTINATION",
  "63033": "RECIPIENT_OPTOUT",
  // WhatsApp-specific (Twilio 63xxx channel errors)
  "63016": "WHATSAPP_SESSION_WINDOW_CLOSED", // free-form sent outside the 24h window
  "63051": "WHATSAPP_RECIPIENT_UNAVAILABLE",
};

function normalizeErrorCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (/^\d{3,6}$/.test(trimmed)) return trimmed;
  return null;
}

function extractCodeFromText(text: string): string | null {
  const explicit = text.match(/(?:error(?:\s*code)?|code)\D*(\d{3,6})/i);
  if (explicit?.[1]) return explicit[1];
  const knownTwilio = text.match(/\b([1-9]\d{3,5})\b/);
  return knownTwilio?.[1] ?? null;
}

function classifyExternalByCode(code: string): string | null {
  if (EXTERNAL_CODE_CATEGORY[code]) return EXTERNAL_CODE_CATEGORY[code];
  const numeric = Number(code);
  if (Number.isFinite(numeric) && numeric >= 30000 && numeric <= 39999) {
    return "CARRIER_OR_DESTINATION";
  }
  // WhatsApp channel errors (Twilio 63xxx) are destination/channel-side, not our fault.
  if (Number.isFinite(numeric) && numeric >= 63000 && numeric <= 63999) {
    return "WHATSAPP_CHANNEL";
  }
  return null;
}

function classifyExternalByText(text: string): string | null {
  if (
    /(unreachable|unknown destination handset|landline|destination handset|carrier network congestion|message filtered|message blocked)/i.test(
      text,
    )
  ) {
    return "CARRIER_OR_DESTINATION";
  }
  if (/(opted out|unsubscribed recipient|reply stop)/i.test(text)) {
    return "RECIPIENT_OPTOUT";
  }
  if (/(outside the allowed window|session window|24.?hour window|re-?engagement)/i.test(text)) {
    return "WHATSAPP_SESSION_WINDOW_CLOSED";
  }
  if (/(short code|not a valid mobile|invalid 'to' phone number|'to' phone number cannot be reached)/i.test(text)) {
    return "INVALID_DESTINATION";
  }
  if (/(destination region permissions disabled)/i.test(text)) {
    return "REGION_PERMISSION_BLOCK";
  }
  return null;
}

function classifyInternalByText(text: string): string {
  if (/(auth|permission denied|unauthorized|invalid token|401|403)/i.test(text)) return "AUTH";
  if (/(timeout|timed out|network|fetch|econn|enotfound|socket hang up)/i.test(text)) return "NETWORK";
  if (/(bad request|invalid request|validation|malformed|400)/i.test(text)) return "INVALID_REQUEST";
  if (/(internal error|service unavailable|provider timeout|503)/i.test(text)) return "PROVIDER";
  return "UNKNOWN";
}

export function classifyFailureScope(input: FailureInput): ClassifiedFailure {
  const text = [
    input.messageStatus || "",
    input.errorMessage || "",
    input.error != null ? String(input.error) : "",
  ]
    .join(" ")
    .trim();

  const normalizedCode =
    normalizeErrorCode(input.errorCode) || normalizeErrorCode(extractCodeFromText(text));

  if (normalizedCode) {
    const externalCategory = classifyExternalByCode(normalizedCode);
    if (externalCategory) {
      return {
        scope: "EXTERNAL",
        code: normalizedCode,
        category: externalCategory,
        normalizedCategory: `EXTERNAL_${externalCategory}`,
      };
    }
  }

  const externalTextCategory = classifyExternalByText(text);
  if (externalTextCategory) {
    return {
      scope: "EXTERNAL",
      code: normalizedCode,
      category: externalTextCategory,
      normalizedCategory: `EXTERNAL_${externalTextCategory}`,
    };
  }

  const internalCategory = classifyInternalByText(text);
  return {
    scope: "INTERNAL",
    code: normalizedCode,
    category: internalCategory,
    normalizedCategory: `INTERNAL_${internalCategory}`,
  };
}

export function scopeFromStoredFailure(input: {
  failureCategory?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}): FailureScope {
  const existing = String(input.failureCategory || "").trim().toUpperCase();
  if (existing.startsWith("EXTERNAL_")) return "EXTERNAL";
  if (existing.startsWith("INTERNAL_")) return "INTERNAL";
  return classifyFailureScope({
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
  }).scope;
}
