import { QueueInspectorService } from "./queue-inspector.service";

const closeSpy = jest.fn();
const getJobsSpy = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    getJobs: (...args: unknown[]) => getJobsSpy(...args),
    close: () => closeSpy(),
  })),
}));

const CREATED = Date.parse("2026-08-02T02:17:39.000Z");

/** A BullMQ job as the inspector reads it. */
function job(over: Record<string, unknown> = {}) {
  return {
    id: "integration-sync_j1",
    name: "integration.sync.list",
    attemptsMade: 10,
    failedReason: "Unsupported state or unable to authenticate data",
    timestamp: CREATED,
    processedOn: null,
    finishedOn: null,
    data: { syncJobId: "j1" },
    stacktrace: ["Error: boom\n  at x"],
    // The ORIGINAL enqueue delay stays 0; BullMQ rewrites `delay` on each retry.
    opts: { attempts: 19, delay: 0 },
    delay: 3 * 86_400_000,
    ...over,
  };
}

function build() {
  const queueConfig = {
    hasRedisConfigured: true,
    queuePrefix: "yarns",
    queueConnection: { url: "redis://x" },
  };
  return new QueueInspectorService(queueConfig as never);
}

beforeEach(() => {
  getJobsSpy.mockReset();
  closeSpy.mockReset();
  getJobsSpy.mockResolvedValue([]);
  // `close()` is awaited (and `.catch`ed) in the service's finally block.
  closeSpy.mockResolvedValue(undefined);
});

describe("QueueInspectorService", () => {
  it("reports a job's failure reason and attempts against the configured ceiling", async () => {
    getJobsSpy.mockResolvedValueOnce([job()]);
    const warnings: string[] = [];
    const jobs = await build().listJobs({ queues: ["integration-sync"], states: ["delayed"], warnings });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      queue: "integration-sync",
      state: "delayed",
      attemptsMade: 10,
      attemptsAllowed: 19,
      failedReason: "Unsupported state or unable to authenticate data",
    });
  });

  // Regression: reading `opts.delay` (the original enqueue option, 0) gave every parked job a
  // next-run equal to its creation time — the exact "nothing is happening" reading this field
  // exists to correct. BullMQ rewrites the job's own `delay` to the current retry backoff.
  it("computes nextRunAt from the CURRENT backoff, not the original enqueue delay", async () => {
    getJobsSpy.mockResolvedValueOnce([job()]);
    const warnings: string[] = [];
    const [inspected] = await build().listJobs({
      queues: ["integration-sync"],
      states: ["delayed"],
      warnings,
    });
    expect(inspected.nextRunAt).toBe(new Date(CREATED + 3 * 86_400_000).toISOString());
    expect(inspected.nextRunAt).not.toBe(new Date(CREATED).toISOString());
  });

  it("only computes a next run for delayed jobs", async () => {
    getJobsSpy.mockResolvedValueOnce([job()]);
    const warnings: string[] = [];
    const [inspected] = await build().listJobs({
      queues: ["integration-sync"],
      states: ["failed"],
      warnings,
    });
    expect(inspected.nextRunAt).toBeNull();
  });

  // Payloads carry CSV bodies and contact lists; a log view must show the shape, not the cargo.
  it("truncates a large payload", async () => {
    getJobsSpy.mockResolvedValueOnce([job({ data: { blob: "x".repeat(2000) } })]);
    const warnings: string[] = [];
    const [inspected] = await build().listJobs({ queues: ["integration-sync"], states: ["delayed"], warnings });
    expect(inspected.data.length).toBeLessThan(600);
    expect(inspected.data.endsWith("…")).toBe(true);
  });

  it("warns on an unknown queue rather than querying it", async () => {
    const warnings: string[] = [];
    await build().listJobs({ queues: ["not-a-queue"], states: ["delayed"], warnings });
    expect(warnings.join()).toContain('Unknown queue "not-a-queue"');
    expect(getJobsSpy).not.toHaveBeenCalled();
  });

  it("warns instead of throwing when a queue is unreadable, and still closes it", async () => {
    getJobsSpy.mockRejectedValueOnce(new Error("redis gone"));
    const warnings: string[] = [];
    const jobs = await build().listJobs({ queues: ["integration-sync"], states: ["delayed"], warnings });
    expect(jobs).toEqual([]);
    expect(warnings.join()).toContain("redis gone");
    expect(closeSpy).toHaveBeenCalled();
  });

  it("reports unconfigured Redis as a warning, not an exception", async () => {
    const service = new QueueInspectorService({ hasRedisConfigured: false } as never);
    const warnings: string[] = [];
    expect(await service.listJobs({ warnings })).toEqual([]);
    expect(warnings.join()).toContain("not configured");
  });
});
