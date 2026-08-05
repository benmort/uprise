import { getApiUrl } from "@uprise/api-client";

/**
 * The public action app's origin, for links/QRs/iframes the admin hands out.
 * Resolution mirrors the action app's own admin-origin derivation
 * (apps/action/next.config.mjs): an explicit env var wins; otherwise derive
 * from the API host the browser is actually using (api.<env>.uprise.org.au →
 * action.<env>.uprise.org.au), so dev tunnels and prod both resolve with no
 * extra configuration; localhost is the last resort only.
 */
export function actionAppOrigin(): string {
  const explicit = (process.env.NEXT_PUBLIC_ACTION_APP_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  try {
    const api = new URL(getApiUrl());
    if (api.hostname.startsWith("api.") && api.hostname.endsWith("uprise.org.au")) {
      return `${api.protocol}//${api.hostname.replace(/^api\./, "action.")}`;
    }
  } catch {
    /* fall through to the local default */
  }
  return "http://localhost:3004";
}
