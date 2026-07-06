/**
 * Pure helpers for surfacing integration (Action Network) sync status on the
 * audiences page. Framework-free (no React, no fetch) so they sit in the vitest
 * `src/lib` coverage scope and are unit-tested directly; the page injects
 * `fetchJobs`/`sleep` into `pollSyncJob`.
 */

export type IntegrationJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

/** Subset of the `GET /integrations/sync-jobs` row the UI needs. */
export type IntegrationSyncJob = {
  id: string;
  audienceId: string | null;
  status: IntegrationJobStatus;
  syncedCount?: number;
  failedCount?: number;
  errorSummary?: string | null;
  remoteListId?: string | null;
  createdAt: string;
};

/** The badge shown in the audiences table for a sync. */
export type SyncBadge = "QUEUED" | "SYNCING" | "DONE" | "FAILED";

/** Map a raw job status to its table badge. */
export function deriveSyncBadge(status: IntegrationJobStatus): SyncBadge {
  switch (status) {
    case "RUNNING":
      return "SYNCING";
    case "SUCCEEDED":
      return "DONE";
    case "FAILED":
      return "FAILED";
    case "QUEUED":
    default:
      return "QUEUED";
  }
}

/** A sync is terminal once it has SUCCEEDED or FAILED — polling can stop. */
export function isTerminalSync(status: IntegrationJobStatus): boolean {
  return status === "SUCCEEDED" || status === "FAILED";
}

/** Most recent sync job for an audience (by ISO createdAt), or undefined. */
export function latestJobForAudience(
  jobs: IntegrationSyncJob[],
  audienceId: string,
): IntegrationSyncJob | undefined {
  let latest: IntegrationSyncJob | undefined;
  for (const job of jobs) {
    if (job.audienceId !== audienceId) continue;
    if (!latest || job.createdAt > latest.createdAt) latest = job;
  }
  return latest;
}

/** Annotate rows with their latest sync badge; rows without a job are unchanged. */
export function mergeSyncBadges<T extends { id: string }>(
  rows: T[],
  jobs: IntegrationSyncJob[],
): Array<T & { syncBadge?: SyncBadge }> {
  return rows.map((row) => {
    const job = latestJobForAudience(jobs, row.id);
    return job ? { ...row, syncBadge: deriveSyncBadge(job.status) } : row;
  });
}

export type PollSyncJobArgs = {
  audienceId: string;
  fetchJobs: () => Promise<IntegrationSyncJob[]>;
  sleep: (ms: number) => Promise<void>;
  maxAttempts?: number;
  intervalMs?: number;
  /** Return false to abort early (e.g. the component unmounted). */
  shouldContinue?: () => boolean;
};

/**
 * Poll the sync-jobs feed until this audience's latest job is terminal, attempts
 * run out, or the caller aborts. Returns the terminal job, else null. A failing
 * fetch is treated as "no jobs yet" so a transient error doesn't end the poll.
 * Deps are injected so this is unit-testable without timers or network.
 */
export async function pollSyncJob({
  audienceId,
  fetchJobs,
  sleep,
  maxAttempts = 40,
  intervalMs = 2000,
  shouldContinue = () => true,
}: PollSyncJobArgs): Promise<IntegrationSyncJob | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!shouldContinue()) return null;
    const jobs = await fetchJobs().catch(() => [] as IntegrationSyncJob[]);
    const job = latestJobForAudience(jobs, audienceId);
    if (job && isTerminalSync(job.status)) return job;
    await sleep(intervalMs);
  }
  return null;
}
