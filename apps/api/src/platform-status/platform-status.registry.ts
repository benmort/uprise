import type { Host } from "./platform-status.types";

/**
 * The deployed estate, in one list.
 *
 * This is the single place that knows what uprise runs. It mirrors `dev/ai/how-to/vercel-ops.md`
 * (seven Vercel projects: admin, auth, api, field, action, product-marketing,
 * organisation-marketing) and `dev/ai/how-to/railway-ops.md` (the always-on BullMQ worker, which
 * Vercel cannot host because it is serverless). Add a deploy target to the estate ⇒ add it here,
 * and both status pages pick it up.
 *
 * `healthPath` is null for apps with no probe of their own. The worker is the honest case: it is a
 * queue consumer with no HTTP server, so it has no endpoint to hit and its health comes from
 * Railway's own deploy state instead. Marketing sites are static — reachable, but a 200 from a
 * static page says nothing beyond "the CDN answered", which is still worth showing.
 *
 * `envUrlKey` names the env var holding the origin, so this file never hardcodes a hostname: the
 * same registry resolves to localhost in dev and the real origins in production.
 */
export type AppDefinition = {
  key: string;
  /** What a human calls it. Used on the admin page. */
  name: string;
  host: Host;
  /** Provider project (Vercel) or service (Railway) name. */
  project: string;
  /** Env var holding this app's public origin. */
  envUrlKey?: string;
  /** Path appended to the origin for the health probe; null when the app exposes none. */
  healthPath: string | null;
  /**
   * Which public-facing service this app rolls up into on the marketing page. Several apps can
   * share one — a visitor experiences "messaging", not "the API plus the worker".
   */
  publicService: string | null;
};

/** Public services, in the order the marketing page lists them. */
export const PUBLIC_SERVICES: ReadonlyArray<{ key: string; name: string }> = [
  { key: "workspace", name: "Organiser workspace" },
  { key: "field", name: "Canvasser app" },
  { key: "actions", name: "Supporter actions" },
  { key: "messaging", name: "Messaging" },
  { key: "website", name: "Website" },
];

export const DEPLOYED_APPS: ReadonlyArray<AppDefinition> = [
  {
    key: "api",
    name: "API",
    host: "vercel",
    project: "uprise-api",
    envUrlKey: "PUBLIC_API_BASE_URL",
    healthPath: "/health",
    // The API is what every organiser action goes through, so its health IS the workspace's.
    publicService: "workspace",
  },
  {
    key: "admin",
    name: "Organiser workspace",
    host: "vercel",
    project: "uprise-admin",
    envUrlKey: "APP_URL",
    healthPath: "/api/health",
    publicService: "workspace",
  },
  {
    key: "auth",
    name: "Auth / SSO",
    host: "vercel",
    project: "uprise-auth",
    envUrlKey: "AUTH_APP_URL",
    healthPath: "/api/health",
    // Signing in is the front door to the workspace; a visitor reads a broken login as
    // "the workspace is down", so it rolls up there rather than getting a line of its own.
    publicService: "workspace",
  },
  {
    key: "field",
    name: "Canvasser app",
    host: "vercel",
    project: "uprise-field",
    envUrlKey: "FIELD_APP_URL",
    healthPath: "/api/health",
    publicService: "field",
  },
  {
    key: "action",
    name: "Supporter action pages",
    host: "vercel",
    project: "uprise-action",
    envUrlKey: "ACTION_APP_URL",
    healthPath: "/api/health",
    publicService: "actions",
  },
  {
    key: "product-marketing",
    name: "Product marketing site",
    host: "vercel",
    project: "uprise-product-marketing",
    envUrlKey: "MARKETING_APP_URL",
    healthPath: "/api/health",
    publicService: "website",
  },
  {
    key: "organisation-marketing",
    name: "Uprise Labs site",
    host: "vercel",
    project: "uprise-organisation-marketing",
    envUrlKey: "ORG_MARKETING_APP_URL",
    healthPath: "/api/health",
    // Uprise Labs is the company site, not part of the product a customer is checking on.
    publicService: null,
  },
  {
    key: "worker",
    name: "Queue worker",
    host: "railway",
    project: "worker",
    // No HTTP server — a BullMQ consumer. Health comes from Railway's deploy state.
    healthPath: null,
    // Blasts, imports and the outbox relay all drain through here, so when the worker is
    // down messaging is what a customer notices.
    publicService: "messaging",
  },
];
