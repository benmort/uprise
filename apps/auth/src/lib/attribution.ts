import type { SignupAttribution } from "@uprise/api-client";

const STORAGE_KEY = "uprise.attribution";

/**
 * Capture signup attribution from the entry URL (utm_*, source, channel/ref) and
 * persist it across the multi-step flow via sessionStorage, so it survives the
 * phone → code hops. Returns the stored attribution when the URL carries none.
 */
export function captureAttribution(): SignupAttribution {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const fromUrl: SignupAttribution = {
    signupSource: params.get("source") ?? undefined,
    utmSource: params.get("utm_source") ?? undefined,
    utmMedium: params.get("utm_medium") ?? undefined,
    utmCampaign: params.get("utm_campaign") ?? undefined,
    referrerChannel: params.get("channel") ?? params.get("ref") ?? undefined,
  };
  const hasAny = Object.values(fromUrl).some(Boolean);
  if (hasAny) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fromUrl));
    } catch {
      // best-effort
    }
    return fromUrl;
  }
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as SignupAttribution) : {};
  } catch {
    return {};
  }
}
