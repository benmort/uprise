import { NotFoundException } from "@nestjs/common";
import { IntegrationsService } from "./integrations.service";

/**
 * Covers the sync QUEUE machinery of IntegrationsService: the eager-audience
 * enqueue path (requestSyncList), the worker handler state machine
 * (processSyncQueueJob) — RUNNING/idempotent/multi-page/SUCCEEDED/FAILED and the
 * per-contact error classifier — and getSyncJobs clamping. Mirrors the mock
 * factory in integrations.sync-identity.spec.ts.
 */
describe("IntegrationsService — sync queue", () => {
  const stats = (over: Record<string, unknown> = {}) => ({
    provider: "ACTION_NETWORK",
    listId: "list1",
    listName: "Vols",
    pagesFetched: 1,
    processedItems: 0,
    returnedContacts: 0,
    skippedNoPhone: 0,
    reasonCounts: {},
    nextCursorUrl: null,
    ...over,
  });

  const contactableRow = (over: Record<string, unknown> = {}) => ({
    externalId: "an:1",
    name: "Ada Lovelace",
    phone: "+61400000000",
    metadata: { source: "ACTION_NETWORK", contactable: true },
    ...over,
  });

  function baseJob(over: Record<string, unknown> = {}) {
    return {
      id: "job1",
      tenantId: "org1",
      status: "QUEUED",
      syncedCount: 0,
      failedCount: 0,
      startedAt: null,
      errorSummary: null,
      audienceId: null,
      connection: { id: "conn1", type: "ACTION_NETWORK", encryptedCredential: "enc", settings: {} },
      ...over,
    };
  }

  function build(opts: { job?: unknown; queueEnqueue?: jest.Mock } = {}) {
    const tx = {
      integrationSyncJob: { update: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({ id: "job1" }) },
      audience: {
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "aud1" }),
      },
    };
    const prisma: any = {
      integrationSyncJob: {
        findUnique: jest.fn().mockResolvedValue("job" in opts ? opts.job : baseJob()),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: "job1" }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      audience: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "aud1" }),
        update: jest.fn().mockResolvedValue({}),
      },
      audienceContact: { upsert: jest.fn().mockResolvedValue({}) },
      integrationConnection: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
    };
    const contacts = {
      getOrCreateByPhone: jest.fn().mockResolvedValue({ id: "c1" }),
      recordSourceRecord: jest.fn().mockResolvedValue(undefined),
      resolveIdentity: jest.fn().mockResolvedValue(null),
    };
    const outbox = { append: jest.fn().mockResolvedValue(undefined) };
    const actionNetwork = { syncList: jest.fn().mockResolvedValue({ contacts: [], stats: stats() }) };
    const queue = {
      enqueue: opts.queueEnqueue ?? jest.fn().mockResolvedValue({ jobId: "q1", queued: true }),
    };
    const service = new IntegrationsService(
      prisma,
      { get: (_k: string, d?: unknown) => d } as any,
      { decrypt: () => "apikey" } as any,
      actionNetwork as any,
      {} as any,
      { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
      contacts as any,
      outbox as any,
      queue as any,
    );
    return { service, prisma, tx, contacts, outbox, actionNetwork, queue };
  }

  const payload = { syncJobId: "job1", type: "ACTION_NETWORK" as const, listId: "list1", audienceName: "Vols", listName: "Vols", run: 1 };

  // ── processSyncQueueJob ────────────────────────────────────────────────────
  it("flips the job to RUNNING before fetching from the connector", async () => {
    const { service, prisma } = build();
    await service.processSyncQueueJob(payload);
    const first = prisma.integrationSyncJob.update.mock.calls[0][0];
    expect(first.where).toEqual({ id: "job1" });
    expect(first.data.status).toBe("RUNNING");
    expect(first.data.completedAt).toBeNull();
    expect(first.data.startedAt).toBeInstanceOf(Date);
  });

  it("short-circuits an already-SUCCEEDED job (idempotent replay)", async () => {
    const { service, prisma, actionNetwork } = build({
      job: baseJob({ status: "SUCCEEDED", syncedCount: 5, failedCount: 1 }),
    });
    const result: any = await service.processSyncQueueJob(payload);
    expect(result).toEqual({ syncJobId: "job1", status: "SUCCEEDED", syncedCount: 5, failedCount: 1 });
    expect(actionNetwork.syncList).not.toHaveBeenCalled();
    expect(prisma.integrationSyncJob.update).not.toHaveBeenCalled();
  });

  it("throws NotFoundException when the sync job is missing", async () => {
    const { service } = build({ job: null });
    await expect(service.processSyncQueueJob(payload)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("re-enqueues the next page and does NOT emit on a multi-page run", async () => {
    const { service, actionNetwork, queue, outbox } = build();
    actionNetwork.syncList.mockResolvedValueOnce({
      contacts: [],
      stats: stats({ nextCursorUrl: "https://an/next", pagesFetched: 1 }),
    });
    const result: any = await service.processSyncQueueJob(payload);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    const enqueued = queue.enqueue.mock.calls[0][0];
    expect(enqueued.payload.cursorUrl).toBe("https://an/next");
    expect(enqueued.payload.run).toBe(2);
    expect(outbox.append).not.toHaveBeenCalled();
    expect(result.status).toBe("RUNNING");
    expect(result.nextCursorUrl).toBe("https://an/next");
  });

  it("on the final page: marks SUCCEEDED, stamps syncedAt, emits audience.imported", async () => {
    const { service, tx, outbox } = build();
    (service as any).actionNetwork.syncList.mockResolvedValueOnce({
      contacts: [contactableRow()],
      stats: stats({ returnedContacts: 1, processedItems: 1, nextCursorUrl: null }),
    });
    await service.processSyncQueueJob(payload);
    const jobUpdate = tx.integrationSyncJob.update.mock.calls[0][0];
    expect(jobUpdate.data.status).toBe("SUCCEEDED");
    expect(jobUpdate.data.syncedCount).toBe(1);
    expect(tx.audience.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ syncedAt: expect.any(Date) }) }),
    );
    const appended = outbox.append.mock.calls[0][1];
    expect(appended.eventType).toBe("audience.imported");
    expect(appended.payload).toEqual({ audienceId: "aud1", tenantId: "org1", count: 1 });
  });

  it("marks the job FAILED and rethrows when the connector throws", async () => {
    const { service, prisma } = build();
    (service as any).actionNetwork.syncList.mockRejectedValueOnce(new Error("AN 500"));
    await expect(service.processSyncQueueJob(payload)).rejects.toThrow("AN 500");
    const failUpdate = prisma.integrationSyncJob.update.mock.calls.at(-1)[0];
    expect(failUpdate.data.status).toBe("FAILED");
    expect(failUpdate.data.errorSummary).toContain("AN 500");
  });

  it("counts a generic per-contact persist error as failedPersist", async () => {
    const { service, prisma } = build();
    (service as any).actionNetwork.syncList.mockResolvedValueOnce({
      contacts: [contactableRow()],
      stats: stats({ returnedContacts: 1, processedItems: 1 }),
    });
    prisma.audienceContact.upsert.mockRejectedValueOnce(new Error("db exploded"));
    const result: any = await service.processSyncQueueJob(payload);
    expect(result.failedCount).toBe(1);
    expect(result.stats.failedPersist).toBe(1);
    expect(result.stats.reasonCounts.persistence_error).toBe(1);
  });

  it("classifies an invalid-phone persist error as skippedInvalidPhone, not failedPersist", async () => {
    const { service, prisma } = build();
    (service as any).actionNetwork.syncList.mockResolvedValueOnce({
      contacts: [contactableRow()],
      stats: stats({ returnedContacts: 1, processedItems: 1 }),
    });
    prisma.audienceContact.upsert.mockRejectedValueOnce(new Error("invalid_phone: not E.164"));
    const result: any = await service.processSyncQueueJob(payload);
    expect(result.stats.skippedInvalidPhone).toBe(1);
    expect(result.stats.failedPersist).toBe(0);
    expect(result.stats.reasonCounts.invalid_phone_format).toBe(1);
  });

  it("reuses an already-stamped audienceId instead of creating a new audience", async () => {
    const { service, prisma, tx } = build({ job: baseJob({ audienceId: "audX" }) });
    (service as any).actionNetwork.syncList.mockResolvedValueOnce({
      contacts: [contactableRow()],
      stats: stats({ returnedContacts: 1, processedItems: 1 }),
    });
    await service.processSyncQueueJob(payload);
    expect(prisma.audience.create).not.toHaveBeenCalled();
    const upsertArg = prisma.audienceContact.upsert.mock.calls[0][0];
    expect(upsertArg.create.audienceId).toBe("audX");
    expect(tx.audience.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "audX" } }));
  });

  it("merges a prior checkpoint (page counts + reason counts) and caps sampleErrors at 20", async () => {
    const prior = JSON.stringify({
      provider: "ACTION_NETWORK",
      listId: "list1",
      audienceName: "Vols",
      pagesFetched: 2,
      processedItems: 10,
      returnedContacts: 10,
      skippedNoPhone: 0,
      skippedInvalidPhone: 0,
      failedPersist: 0,
      reasonCounts: { invalid_phone_format: 1 },
      sampleErrors: Array.from({ length: 25 }, (_, i) => `e${i}`),
      runCount: 2,
    });
    const { service } = build({ job: baseJob({ errorSummary: prior }) });
    (service as any).actionNetwork.syncList.mockResolvedValueOnce({ contacts: [], stats: stats({ pagesFetched: 1 }) });
    const result: any = await service.processSyncQueueJob(payload);
    expect(result.stats.pagesFetched).toBe(3); // 2 prior + 1 this run
    expect(result.stats.reasonCounts.invalid_phone_format).toBe(1);
    expect(result.stats.sampleErrors.length).toBeLessThanOrEqual(20);
  });

  it("falls back to a fresh checkpoint when errorSummary is malformed JSON", async () => {
    const { service } = build({ job: baseJob({ errorSummary: "{not json" }) });
    await expect(service.processSyncQueueJob(payload)).resolves.toBeTruthy();
  });

  // ── requestSyncList (eager audience + enqueue) ─────────────────────────────
  it("requestSyncList eagerly creates the audience, stamps it on the job, returns audienceId", async () => {
    const { service, tx, queue } = build();
    jest.spyOn(service as any, "ensureConnection").mockResolvedValue({ id: "conn1" });
    const res = await service.syncList("org1", { type: "ACTION_NETWORK", listId: "list1", listName: "Vols" } as any);
    expect(tx.audience.create).toHaveBeenCalled();
    expect(tx.integrationSyncJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ audienceId: "aud1" }) }),
    );
    expect(queue.enqueue).toHaveBeenCalled();
    expect(res).toMatchObject({ syncJobId: "job1", audienceId: "aud1", status: "QUEUED", queued: true });
  });

  it("requestSyncList reuses an existing audience for the same list (no duplicate)", async () => {
    const { service, tx } = build();
    tx.audience.findFirst.mockResolvedValueOnce({ id: "audExisting" });
    jest.spyOn(service as any, "ensureConnection").mockResolvedValue({ id: "conn1" });
    const res = await service.syncList("org1", { type: "ACTION_NETWORK", listId: "list1" } as any);
    expect(tx.audience.create).not.toHaveBeenCalled();
    expect(res.audienceId).toBe("audExisting");
  });

  it("requestSyncList marks the job FAILED and rethrows when enqueue fails", async () => {
    const enqueue = jest.fn().mockRejectedValue(new Error("redis down"));
    const { service, prisma } = build({ queueEnqueue: enqueue });
    jest.spyOn(service as any, "ensureConnection").mockResolvedValue({ id: "conn1" });
    await expect(
      service.syncList("org1", { type: "ACTION_NETWORK", listId: "list1" } as any),
    ).rejects.toThrow("redis down");
    const failUpdate = prisma.integrationSyncJob.update.mock.calls.at(-1)[0];
    expect(failUpdate.data.status).toBe("FAILED");
  });

  // ── connection management ──────────────────────────────────────────────────
  it("setConnectionStatus updates the scoped connection and echoes the new status", async () => {
    const { service, prisma } = build();
    prisma.integrationConnection.updateMany.mockResolvedValue({ count: 1 });
    const res = await service.setConnectionStatus("org1", "conn1", "INACTIVE" as any);
    expect(res).toEqual({ id: "conn1", status: "INACTIVE" });
    expect(prisma.integrationConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "conn1", tenantId: "org1" }, data: { status: "INACTIVE" } }),
    );
  });

  it("setConnectionStatus throws NotFoundException when nothing matched", async () => {
    const { service, prisma } = build();
    prisma.integrationConnection.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.setConnectionStatus("org1", "missing", "INACTIVE" as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("deleteConnection removes the scoped connection", async () => {
    const { service, prisma } = build();
    prisma.integrationConnection.deleteMany.mockResolvedValue({ count: 1 });
    expect(await service.deleteConnection("org1", "conn1")).toEqual({ deleted: true });
  });

  it("deleteConnection throws NotFoundException when nothing matched", async () => {
    const { service, prisma } = build();
    prisma.integrationConnection.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.deleteConnection("org1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("listConnections returns the tenant's connections", async () => {
    const { service, prisma } = build();
    prisma.integrationConnection.findMany.mockResolvedValue([{ id: "conn1", type: "ACTION_NETWORK" }]);
    const res = await service.listConnections("org1");
    expect(res).toEqual([{ id: "conn1", type: "ACTION_NETWORK" }]);
    expect(prisma.integrationConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "org1" } }),
    );
  });

  // ── getSyncJobs ────────────────────────────────────────────────────────────
  it("getSyncJobs clamps the limit to [1, 100]", async () => {
    const { service, prisma } = build();
    await service.getSyncJobs("org1", 0);
    await service.getSyncJobs("org1", 5000);
    await service.getSyncJobs("org1");
    expect(prisma.integrationSyncJob.findMany.mock.calls[0][0]).toMatchObject({ take: 1 });
    expect(prisma.integrationSyncJob.findMany.mock.calls[1][0]).toMatchObject({ take: 100 });
    expect(prisma.integrationSyncJob.findMany.mock.calls[2][0]).toMatchObject({ take: 20 });
  });
});
