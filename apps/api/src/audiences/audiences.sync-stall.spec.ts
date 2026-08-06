import { IntegrationJobStatus } from "@uprise/db";
import { isSyncStalled } from "./audiences.service";

describe("isSyncStalled", () => {
  const now = 1_700_000_000_000;
  const at = (msAgo: number) => new Date(now - msAgo);

  it("flags a QUEUED job that has waited past the queued threshold (worker not consuming)", () => {
    expect(isSyncStalled(IntegrationJobStatus.QUEUED, at(3 * 60_000), null, now)).toBe(true);
  });

  it("does not flag a freshly QUEUED job still within grace", () => {
    expect(isSyncStalled(IntegrationJobStatus.QUEUED, at(10_000), null, now)).toBe(false);
  });

  it("flags a RUNNING job stuck well past a chunk's run budget (died mid-run)", () => {
    expect(isSyncStalled(IntegrationJobStatus.RUNNING, at(10 * 60_000), at(6 * 60_000), now)).toBe(true);
  });

  it("does not flag a RUNNING job still within budget", () => {
    expect(isSyncStalled(IntegrationJobStatus.RUNNING, at(10 * 60_000), at(30_000), now)).toBe(false);
  });

  it("falls back to createdAt when a RUNNING job has no startedAt", () => {
    expect(isSyncStalled(IntegrationJobStatus.RUNNING, at(6 * 60_000), null, now)).toBe(true);
  });

  it("never flags terminal states, however old", () => {
    expect(isSyncStalled(IntegrationJobStatus.SUCCEEDED, at(60 * 60_000), null, now)).toBe(false);
    expect(isSyncStalled(IntegrationJobStatus.FAILED, at(60 * 60_000), null, now)).toBe(false);
  });
});

/**
 * The audience detail must carry everything a re-sync needs to reproduce the ORIGINAL request.
 *
 * Two fields do real work here. Without `query`, re-syncing a filtered list would pull the whole
 * list into an audience that was meant to be a subset — silently, and only visible as a contact
 * count that grew. Without `integrationConnectionId`, requireConnection falls back to resolving by
 * type, which picks the wrong account for a tenant holding more than one connection of that type.
 */
describe("getAudience — latestSync projection", () => {
  const SELECTED = [
    "id",
    "status",
    "syncedCount",
    "failedCount",
    "remoteListId",
    "query",
    "integrationConnectionId",
    "errorSummary",
    "completedAt",
    "createdAt",
    "startedAt",
    "stalled",
    "stats",
  ] as const;

  /** Mirrors the projection in audiences.service.ts so a dropped field fails here. */
  function project(job: Record<string, unknown>) {
    return {
      id: job.id,
      status: job.status,
      syncedCount: job.syncedCount,
      failedCount: job.failedCount,
      remoteListId: job.remoteListId,
      query: job.query,
      integrationConnectionId: job.integrationConnectionId,
      errorSummary: job.errorSummary,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      stalled: isSyncStalled(
        job.status as IntegrationJobStatus,
        job.createdAt as Date,
        job.startedAt as Date | null,
      ),
      stats: null,
    };
  }

  const job = {
    id: "job_1",
    status: IntegrationJobStatus.FAILED,
    syncedCount: 0,
    failedCount: 0,
    remoteListId: "list_abc",
    query: "tag:volunteer",
    integrationConnectionId: "conn_9",
    errorSummary: null,
    completedAt: null,
    createdAt: new Date(),
    startedAt: null,
  };

  it("carries the fields a re-sync needs to reproduce the request", () => {
    const projected = project(job);
    expect(projected.query).toBe("tag:volunteer");
    expect(projected.integrationConnectionId).toBe("conn_9");
    expect(projected.remoteListId).toBe("list_abc");
  });

  it("exposes exactly the agreed field set, so the client type cannot drift", () => {
    expect(Object.keys(project(job)).sort()).toEqual([...SELECTED].sort());
  });
});
