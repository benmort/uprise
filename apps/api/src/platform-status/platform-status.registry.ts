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
 * Every row is probed: each Next app serves `/api/health`, the API serves `/api/v1/health` (with
 * its per-dependency checks) and the worker serves `/health` off its Bull Board server. A row with
 * `healthPath: null` would fall back to provider deploy state, which describes the last BUILD, not
 * whether anything is running — the worker had exactly that problem, sitting on 48 SKIPPED builds
 * while serving happily. Marketing sites are static, so their 200 says only "the CDN answered",
 * which is still what a visitor means by "is the website up".
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
    // API_BASE_URL is required env (env.validation.ts), so this row always has an origin.
    envUrlKey: "API_BASE_URL",
    // Nest mounts everything under the `api/v1` global prefix set in bootstrap.ts — bare /health
    // is a 404, which the probe would read as the API being down.
    healthPath: "/api/v1/health",
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
    // The Vercel project predates the `product-marketing` app directory and is still just
    // `uprise-marketing` — the deploy lookup matches on the provider's name, not ours.
    project: "uprise-marketing",
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
    // It does answer HTTP: apps/worker/src/main.ts mounts /health (and Bull Board) on
    // WORKER_HEALTH_PORT, published at worker.uprise.org.au. Probing that beats inferring health
    // from Railway's deploy state, which only ever describes the last BUILD.
    envUrlKey: "WORKER_HEALTH_URL",
    healthPath: "/health",
    // Blasts, imports and the outbox relay all drain through here, so when the worker is
    // down messaging is what a customer notices.
    publicService: "messaging",
  },
];
