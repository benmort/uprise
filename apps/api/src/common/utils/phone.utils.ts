import { ApiHttpException } from "../http/api-response";

export function normalizePhoneE164(input: string): string {
  const raw = String(input || "").trim();
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    throw new ApiHttpException("INVALID_PHONE", "Phone must be in E.164 format (e.g. +15551234567)");
  }
  if (!/^\+\d{8,15}$/.test(cleaned)) {
    throw new ApiHttpException("INVALID_PHONE", "Phone must be in E.164 format (e.g. +15551234567)");
  }
  return cleaned;
}
