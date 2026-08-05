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
  /**
   * Something the provider says about this deploy that health alone doesn't carry — e.g. the
   * worker is up on an older deploy because the newest build failed. INTERNAL ONLY: it reaches
   * the admin page through AppStatus.detail and is never part of the public payload.
   */
  note?: string;
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
  /** Only ever these four words on the public page. */
  status: PublicServiceStatus;
  /**
   * Share of the last 90 days' recorded checks that found this service Operational, or null
   * when nothing was recorded in the window (a fresh install, or the cron stopped) — which is
   * reported as "no data" rather than as 100%.
   */
  uptime90d: number | null;
};

/**
 * `Unknown` is not padding: it means the check could not be made (an app with no origin
 * configured), and a status page that renders that as "Operational" is claiming something it
 * doesn't know.
 */
export type PublicServiceStatus = "Operational" | "Degraded" | "Outage" | "Unknown";

/** One day of the 90-day bar. `none` is a day with no recorded checks. */
export type PublicDay = {
  /** YYYY-MM-DD, UTC. */
  date: string;
  state: "up" | "partial" | "down" | "none";
};

/** A past (or current) period of trouble on one service. Public: no internals, ever. */
export type PublicIncident = {
  id: string;
  serviceName: string;
  /** "Degraded" or "Outage" — the worst the service reached while the incident was open. */
  status: string;
  startedAt: string;
  /** Null while the incident is still open. */
  resolvedAt: string | null;
  /** Whole minutes; for an open incident, minutes so far. */
  minutes: number;
};

export type PublicStatus = {
  ok: boolean;
  /** Plain-language summary, e.g. "All systems operational". */
  summary: string;
  services: PublicService[];
  /** Oldest first, up to 90 entries. Empty until the recorder has run at least once. */
  days: PublicDay[];
  /** Newest first, the handful worth showing. Empty when nothing has gone wrong. */
  incidents: PublicIncident[];
  at: string;
};
