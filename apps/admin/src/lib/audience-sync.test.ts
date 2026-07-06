import { describe, expect, it, vi } from "vitest";
import {
  deriveSyncBadge,
  isTerminalSync,
  latestJobForAudience,
  mergeSyncBadges,
  pollSyncJob,
  type IntegrationSyncJob,
} from "./audience-sync";

const job = (over: Partial<IntegrationSyncJob> & { id: string }): IntegrationSyncJob => ({
  audienceId: "aud1",
  status: "QUEUED",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("deriveSyncBadge", () => {
  it("maps each status to its badge", () => {
    expect(deriveSyncBadge("QUEUED")).toBe("QUEUED");
    expect(deriveSyncBadge("RUNNING")).toBe("SYNCING");
    expect(deriveSyncBadge("SUCCEEDED")).toBe("DONE");
    expect(deriveSyncBadge("FAILED")).toBe("FAILED");
  });
});

describe("isTerminalSync", () => {
  it("is true only for SUCCEEDED / FAILED", () => {
    expect(isTerminalSync("SUCCEEDED")).toBe(true);
    expect(isTerminalSync("FAILED")).toBe(true);
    expect(isTerminalSync("QUEUED")).toBe(false);
    expect(isTerminalSync("RUNNING")).toBe(false);
  });
});

describe("latestJobForAudience", () => {
  it("returns the most recent job for the audience", () => {
    const jobs = [
      job({ id: "old", createdAt: "2026-01-01T00:00:00.000Z" }),
      job({ id: "new", createdAt: "2026-01-02T00:00:00.000Z" }),
    ];
    expect(latestJobForAudience(jobs, "aud1")?.id).toBe("new");
  });

  it("ignores jobs for other audiences", () => {
    const jobs = [job({ id: "j1", audienceId: "other" })];
    expect(latestJobForAudience(jobs, "aud1")).toBeUndefined();
  });

  it("returns undefined when there are no jobs", () => {
    expect(latestJobForAudience([], "aud1")).toBeUndefined();
  });
});

describe("mergeSyncBadges", () => {
  it("annotates matching rows and leaves others untouched", () => {
    const rows = [{ id: "aud1", name: "A" }, { id: "aud2", name: "B" }];
    const jobs = [job({ id: "j1", audienceId: "aud1", status: "RUNNING" })];
    const merged = mergeSyncBadges(rows, jobs);
    expect(merged[0]).toEqual({ id: "aud1", name: "A", syncBadge: "SYNCING" });
    expect(merged[1]).toEqual({ id: "aud2", name: "B" });
  });
});

describe("pollSyncJob", () => {
  const sleep = () => Promise.resolve();

  it("returns the job as soon as it is terminal", async () => {
    const fetchJobs = vi.fn(async () => [job({ id: "j1", status: "SUCCEEDED" })]);
    const result = await pollSyncJob({ audienceId: "aud1", fetchJobs, sleep });
    expect(result?.status).toBe("SUCCEEDED");
    expect(fetchJobs).toHaveBeenCalledTimes(1);
  });

  it("keeps polling through non-terminal states until terminal", async () => {
    const statuses: IntegrationSyncJob["status"][] = ["QUEUED", "RUNNING", "FAILED"];
    let i = 0;
    const fetchJobs = vi.fn(async () => [job({ id: "j1", status: statuses[i++] })]);
    const result = await pollSyncJob({ audienceId: "aud1", fetchJobs, sleep });
    expect(result?.status).toBe("FAILED");
    expect(fetchJobs).toHaveBeenCalledTimes(3);
  });

  it("returns null after maxAttempts without a terminal job", async () => {
    const fetchJobs = vi.fn(async () => [job({ id: "j1", status: "RUNNING" })]);
    const result = await pollSyncJob({ audienceId: "aud1", fetchJobs, sleep, maxAttempts: 3 });
    expect(result).toBeNull();
    expect(fetchJobs).toHaveBeenCalledTimes(3);
  });

  it("aborts early when shouldContinue returns false", async () => {
    const fetchJobs = vi.fn(async () => [job({ id: "j1", status: "RUNNING" })]);
    const result = await pollSyncJob({
      audienceId: "aud1",
      fetchJobs,
      sleep,
      shouldContinue: () => false,
    });
    expect(result).toBeNull();
    expect(fetchJobs).not.toHaveBeenCalled();
  });

  it("treats a failing fetch as no-jobs-yet and keeps polling", async () => {
    const fetchJobs = vi
      .fn<() => Promise<IntegrationSyncJob[]>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce([job({ id: "j1", status: "SUCCEEDED" })]);
    const result = await pollSyncJob({ audienceId: "aud1", fetchJobs, sleep, maxAttempts: 5 });
    expect(result?.status).toBe("SUCCEEDED");
    expect(fetchJobs).toHaveBeenCalledTimes(2);
  });
});
