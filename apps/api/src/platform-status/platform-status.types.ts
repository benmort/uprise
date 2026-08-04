/**
 * The shape both status surfaces read.
 *
 * TWO AUDIENCES, ONE SERVICE. The admin page (`/status`, super-admin) gets `PlatformStatus` in
 * full — every deployed app, its last deploy sha, who triggered it and when. The marketing page
 * (`/status`, open to the world) gets `PublicStatus`, which is the same health rolled up into
 * plain-language services and a version string, with every internal detail dropped rather than
 * hidden client-side. Deriving the public view on the server is the point: a commit sha that never
 * leaves the API cannot be read out of a network tab.
 */

/** Where an app runs. Vercel hosts the seven Next/Nest apps; Railway hosts the BullMQ worker. */
export type Host = "vercel" | "railway";

/**
 * Health as the page shows it.
 *   up        — the probe answered and reported healthy
 *   degraded  — the probe answered, but something it depends on is down (the API's own /health
 *               reports `ok: false` when the DB check fails, which is degraded, not gone)
 *   down      — no answer, an error status, or the request timed out
 *   unknown   — never probed (no health URL configured for this app)
 */
export type Health = "up" | "degraded" | "down" | "unknown";

/** The last deploy, as the provider reports it. Absent when the provider API is unreachable. */
export type DeployInfo = {
  /** Full commit sha. INTERNAL ONLY — never present on the public payload. */
  sha?: string;
  /** Provider deployment state, verbatim (READY, ERROR, BUILDING, SUCCESS…). */
  state?: string;
  /** ISO timestamp of the deploy. */
  at?: string;
  /** Branch or environment the deploy came from. */
  target?: string;
};

export type AppStatus = {
  /** Stable id used as the React key and the provider lookup. */
  key: string;
  /** Human name — "Organiser workspace", not "uprise-admin". */
  name: string;
  host: Host;
  /** The provider's project/service name, e.g. `uprise-admin`. Internal only. */
  project: string;
  /** Public origin, when the app has one a browser can reach. */
  url?: string;
  health: Health;
  /** Round-trip of the health probe, in ms. Absent when the probe did not answer. */
  latencyMs?: number;
  /** Why the health is what it is — an HTTP status, an error name, or a failing sub-check. */
  detail?: string;
  deploy?: DeployInfo;
};

export type PlatformStatus = {
  /** `false` when ANY app is down. Degraded does not clear it — see rollUp(). */
  ok: boolean;
  apps: AppStatus[];
  /** When this snapshot was taken (not when it was served — it may be cached). */
  at: string;
  /**
   * Present when a provider API could not be reached, so the page can say "deploy info
   * unavailable" instead of silently showing every app as never-deployed.
   */
  warnings?: string[];
};

/** A public-facing service. Deliberately coarser than an app: visitors do not know or care that
 *  the organiser workspace and the API are separate deploys. */
export type PublicService = {
  key: string;
  name: string;
  /** Only ever these three words on the public page. */
  status: "Operational" | "Degraded" | "Outage";
};

export type PublicStatus = {
  ok: boolean;
  /** Plain-language summary, e.g. "All systems operational". */
  summary: string;
  services: PublicService[];
  /**
   * A MOCK version string — see PLATFORM_VERSION in platform-status.service.ts. The product does
   * not version its releases today; this exists so the page has the shape a status page has.
   */
  version: string;
  at: string;
};
