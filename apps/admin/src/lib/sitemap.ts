import { siblingOrigin, type AppName } from "@uprise/domains";
import manifest from "@/generated/sitemap.json";

export type SitemapRoute = {
  path: string;
  /** Contains a dynamic segment (`[id]` / `[...slug]`) — can't be opened without a value. */
  dynamic: boolean;
  /** The route group(s) the file sits in (stripped from the URL), for display. */
  group: string | null;
};

export type SitemapApp = {
  key: string;
  label: string;
  prodUrl: string;
  routeCount: number;
  routes: SitemapRoute[];
};

export type SitemapManifest = { $comment: string; generatedAt: string; apps: SitemapApp[] };

export const sitemap = manifest as SitemapManifest;

// Apps whose live origin can be derived from the current host (they're `<app>.<root>`
// subdomains). The two marketing apps live on their own apex domains, so they always
// use the committed prod URL.
const PLATFORM_APPS: Record<string, AppName> = { admin: "admin", auth: "auth", action: "action", field: "field" };

/**
 * The base origin for an app in the CURRENT environment. Platform apps derive from the
 * live admin host — so links point at prod hosts in prod and the right tenant subdomain
 * under white-label — falling back to the committed prod URL when the host isn't
 * derivable (e.g. localhost) or for the apex-domain marketing apps.
 */
export function liveOrigin(appKey: string, prodUrl: string): string {
  const platform = PLATFORM_APPS[appKey];
  if (platform && typeof window !== "undefined") {
    const proto = window.location.protocol.replace(":", "") || "https";
    const derived = siblingOrigin(window.location.host, platform, proto);
    if (derived) return derived;
  }
  return prodUrl;
}

/** The openable href for a static route, or null for a dynamic pattern. */
export function routeHref(app: SitemapApp, route: SitemapRoute): string | null {
  if (route.dynamic) return null;
  return `${liveOrigin(app.key, app.prodUrl)}${route.path === "/" ? "" : route.path}`;
}
