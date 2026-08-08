import { NotFoundException } from "@nestjs/common";
import { UnrecoverableError } from "bullmq";
import { IntegrationsService } from "./integrations.service";
import { IntegrationNotConnectedError } from "./integration.errors";
import { CredentialDecryptionError } from "./credential-crypto.service";

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

  function build(
    opts: { job?: unknown; queueEnqueue?: jest.Mock; decrypt?: () => string; nbSync?: jest.Mock } = {},
  ) {
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
      // The page's spine prime: one read of the contacts that already exist.
      contact: { findMany: jest.fn().mockResolvedValue([]) },
      integrationConnection: {
        // The tenant's own active connection. requestSyncList resolves through this —
        // there is no env fallback and nothing is auto-created, so a test that wants a
        // sync to proceed has to supply a connection, exactly like a real tenant does.
        findFirst: jest.fn().mockResolvedValue({
          id: "conn1",
          tenantId: "org1",
          type: "ACTION_NETWORK",
          name: "Action Network",
          status: "ACTIVE",
          encryptedCredential: "enc",
          settings: null,
        }),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: "conn1" }),
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
    const nationBuilder = {
      syncList:
        opts.nbSync ??
        jest.fn().mockResolvedValue({ contacts: [], stats: stats({ provider: "NATION_BUILDER" }) }),
    };
    const queue = {
      enqueue: opts.queueEnqueue ?? jest.fn().mockResolvedValue({ jobId: "q1", queued: true }),
    };
    const contactTags = { applyTag: jest.fn().mockResolvedValue(undefined) };
    const consent = { setState: jest.fn().mockResolvedValue(undefined) };
    const service = new IntegrationsService(
      prisma,
      { get: (_k: string, d?: unknown) => d } as any,
      { decrypt: opts.decrypt ?? (() => "apikey") } as any,
      actionNetwork as any,
      {} as any,
      nationBuilder as any,
      { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
      contacts as any,
      outbox as any,
      queue as any,
      contactTags as any,
      consent as any,
    );
    return { service, prisma, tx, contacts, outbox, actionNetwork, nationBuilder, queue, contactTags, consent };
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

  // Regression: the credential decrypt used to sit ABOVE the try/catch, so a worker whose
  // INTEGRATION_CREDENTIAL_SECRET had drifted from the API's threw before the row was
  // touched. The job stayed QUEUED with a null startedAt forever and the audience page
  // read "queued but hasn't started — the background importer isn't processing it", while
  // the worker was picking it up and dying on the same line every retry.
  it("marks the job FAILED when the credential cannot be decrypted (never leaves it QUEUED)", async () => {
    const { service, prisma, actionNetwork } = build({
      decrypt: () => {
        throw new CredentialDecryptionError(new Error("Unsupported state or unable to authenticate data"));
      },
    });
    await expect(service.processSyncQueueJob(payload)).rejects.toBeInstanceOf(UnrecoverableError);
    const failUpdate = prisma.integrationSyncJob.update.mock.calls.at(-1)[0];
    expect(failUpdate.where).toEqual({ id: "job1" });
    expect(failUpdate.data.status).toBe("FAILED");
    expect(failUpdate.data.errorSummary).toContain("INTEGRATION_CREDENTIAL_SECRET");
    expect(failUpdate.data.completedAt).toBeInstanceOf(Date);
    expect(actionNetwork.syncList).not.toHaveBeenCalled();
  });

  // A key that does not match never starts matching, so retrying it burns 19 attempts on
  // an exponential backoff and parks the job in `delayed` (removeOnFail: false) where no
  // failure count surfaces it. UnrecoverableError routes it straight to `failed`.
  it("raises UnrecoverableError for a decrypt failure so BullMQ does not retry it", async () => {
    const { service } = build({
      decrypt: () => {
        throw new CredentialDecryptionError();
      },
    });
    await expect(service.processSyncQueueJob(payload)).rejects.toThrow(/INTEGRATION_CREDENTIAL_SECRET/);
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

  it("pools the page but still accounts for a poison row, and keeps every good one", async () => {
    const { service, prisma, contacts } = build();
    const rows = Array.from({ length: 50 }, (_, i) =>
      contactableRow({ externalId: `an:${i}`, phone: `+6140000${String(i).padStart(4, "0")}` }),
    );
    (service as any).actionNetwork.syncList.mockResolvedValueOnce({
      contacts: rows,
      stats: stats({ returnedContacts: 50, processedItems: 50 }),
    });
    // One row blows up inside the pool. Its neighbours must be unaffected: the per-row
    // try/catch still owns the failure, it is still classified, and the page continues.
    prisma.audienceContact.upsert.mockImplementation(async ({ create }: any) =>
      create.externalId === "an:17" ? Promise.reject(new Error("db exploded")) : {},
    );

    const result: any = await service.processSyncQueueJob(payload);

    expect(result.syncedCount).toBe(49);
    expect(result.failedCount).toBe(1);
    expect(result.stats.failedPersist).toBe(1);
    expect(result.stats.reasonCounts.persistence_error).toBe(1);
    expect(result.stats.sampleErrors).toContain("Error: db exploded");
    expect(prisma.audienceContact.upsert).toHaveBeenCalledTimes(50);
    expect(contacts.getOrCreateByPhone).toHaveBeenCalledTimes(50);
  });

  it("primes the contact spines for the page in one read and hands each row its own", async () => {
    const { service, prisma, contacts } = build();
    (service as any).actionNetwork.syncList.mockResolvedValueOnce({
      contacts: [contactableRow(), contactableRow({ externalId: "an:2", phone: "+61400000001" })],
      stats: stats({ returnedContacts: 2, processedItems: 2 }),
    });
    const spine = { id: "cExisting", phoneE164: "+61400000000" };
    prisma.contact.findMany.mockResolvedValue([spine]);

    await service.processSyncQueueJob(payload);

    expect(prisma.contact.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.contact.findMany).toHaveBeenCalledWith({
      where: { tenantId: "org1", phoneE164: { in: ["+61400000000", "+61400000001"] } },
    });
    // The known person arrives pre-resolved; the unknown one falls through to the lookup.
    expect(contacts.getOrCreateByPhone).toHaveBeenCalledWith("org1", "+61400000000", expect.anything(), spine);
    expect(contacts.getOrCreateByPhone).toHaveBeenCalledWith("org1", "+61400000001", expect.anything(), undefined);
  });

  it("keeps rows that share a phone in order rather than racing them", async () => {
    const { service, prisma } = build();
    (service as any).actionNetwork.syncList.mockResolvedValueOnce({
      contacts: [
        contactableRow({ externalId: "an:1", name: "First" }),
        contactableRow({ externalId: "an:2", name: "Second" }),
      ],
      stats: stats({ returnedContacts: 2, processedItems: 2 }),
    });
    const seen: string[] = [];
    prisma.audienceContact.upsert.mockImplementation(async ({ create }: any) => {
      seen.push(create.externalId);
      return {};
    });

    await service.processSyncQueueJob(payload);

    // Two people on one phone number: the audience row is unique on it, so they must not
    // be in flight together – the pool runs them as one serial group.
    expect(seen).toEqual(["an:1", "an:2"]);
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
    const res = await service.syncList("org1", { type: "ACTION_NETWORK", listId: "list1", listName: "Vols" } as any);
    expect(tx.audience.create).toHaveBeenCalled();
    expect(tx.integrationSyncJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ audienceId: "aud1" }) }),
    );
    expect(queue.enqueue).toHaveBeenCalled();
    expect(res).toMatchObject({ syncJobId: "job1", audienceId: "aud1", status: "QUEUED", queued: true });
  });

  it("requestSyncList stamps the resolving connection on the new audience", async () => {
    const { service, tx } = build();
    await service.syncList("org1", { type: "ACTION_NETWORK", listId: "list1" } as any);
    expect(tx.audience.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ integrationConnectionId: "conn1" }) }),
    );
  });

  it("requestSyncList reuses an existing audience for the same list (no duplicate)", async () => {
    const { service, tx } = build();
    tx.audience.findFirst.mockResolvedValueOnce({ id: "audExisting" });
    const res = await service.syncList("org1", { type: "ACTION_NETWORK", listId: "list1" } as any);
    expect(tx.audience.create).not.toHaveBeenCalled();
    expect(res.audienceId).toBe("audExisting");
    // A re-sync may run through a different connection than last time; keep it current.
    expect(tx.audience.update).toHaveBeenCalledWith({
      where: { id: "audExisting" },
      data: { integrationConnectionId: "conn1" },
    });
  });

  it("requestSyncList marks the job FAILED and rethrows when enqueue fails", async () => {
    const enqueue = jest.fn().mockRejectedValue(new Error("redis down"));
    const { service, prisma } = build({ queueEnqueue: enqueue });
    await expect(
      service.syncList("org1", { type: "ACTION_NETWORK", listId: "list1" } as any),
    ).rejects.toThrow("redis down");
    const failUpdate = prisma.integrationSyncJob.update.mock.calls.at(-1)[0];
    expect(failUpdate.data.status).toBe("FAILED");
  });

  it("requestSyncList refuses to sync when the tenant has no connection", async () => {
    const { service, prisma, tx } = build();
    prisma.integrationConnection.findFirst.mockResolvedValue(null);
    await expect(
      service.syncList("org1", { type: "ACTION_NETWORK", listId: "list1" } as any),
    ).rejects.toBeInstanceOf(IntegrationNotConnectedError);
    // Nothing auto-created, nothing written — this is the leak that let every tenant
    // import through the platform env key.
    expect(prisma.integrationConnection.upsert).not.toHaveBeenCalled();
    expect(tx.audience.create).not.toHaveBeenCalled();
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

  it("getSyncJobs keeps the badge fields and leaves the JSON blobs on the server", async () => {
    const { service, prisma } = build();
    await service.getSyncJobs("org1");
    const { select } = prisma.integrationSyncJob.findMany.mock.calls[0][0];
    // Everything the audiences page renders a sync badge from.
    for (const field of [
      "id", "audienceId", "status", "remoteListId",
      "syncedCount", "failedCount", "errorSummary",
      "startedAt", "completedAt", "createdAt",
    ]) {
      expect(select[field]).toBe(true);
    }
    // …and neither of the JSON documents nobody reads.
    expect(select.checkpoint).toBeUndefined();
    expect(select.query).toBeUndefined();
  });

  // ── NationBuilder pull extras (tags, email-only people, opt-out mirror) ─────
  describe("NationBuilder pull", () => {
    const nbPayload = {
      syncJobId: "job1",
      type: "NATION_BUILDER" as const,
      listId: "7",
      audienceName: "NationBuilder: Vols",
      listName: "Vols",
      run: 1,
    };
    const nbJob = (settings: unknown = {}) =>
      baseJob({
        connection: {
          id: "conn1",
          type: "NATION_BUILDER",
          encryptedCredential: "enc",
          settings,
          externalGroup: "riverside",
        },
      });
    const nbPerson = (over: Record<string, unknown> = {}, nb: Record<string, unknown> = {}) => ({
      externalId: "12",
      name: "Ada Nguyen",
      phone: "+61400000000",
      metadata: { email: "ada@example.org", nationBuilder: { id: 12, tags: ["doorknockers"], ...nb } },
      ...over,
    });
    const nbSyncOf = (contacts: unknown[]) =>
      jest.fn().mockResolvedValue({
        contacts,
        stats: stats({ provider: "NATION_BUILDER", listId: "7", returnedContacts: contacts.length }),
      });

    it("keeps an email-only person as a non-contactable row instead of dropping them", async () => {
      const nbSync = nbSyncOf([nbPerson({ phone: "" })]);
      const { service, prisma, contacts } = build({ job: nbJob(), nbSync });
      await service.processSyncQueueJob(nbPayload);
      // No spine resolution for a non-contactable row…
      expect(contacts.getOrCreateByPhone).not.toHaveBeenCalled();
      // …but the audience row IS written, under the synthetic phone key.
      const upsert = prisma.audienceContact.upsert.mock.calls[0][0];
      expect(upsert.where.audienceId_phoneE164.phoneE164).toBe("__noncontactable__:12");
      expect(upsert.create.metadata).toMatchObject({
        contactable: false,
        nonContactableReason: "missing_phone_number",
      });
    });

    it("mirrors NB person tags onto contact tags with source nation_builder", async () => {
      const nbSync = nbSyncOf([nbPerson()]);
      const { service, contactTags } = build({ job: nbJob(), nbSync });
      await service.processSyncQueueJob(nbPayload);
      expect(contactTags.applyTag).toHaveBeenCalledWith("org1", "c1", "doorknockers", "nation_builder");
    });

    it("writes NATION-SCOPED source records — person 12 of two nations must never collide", async () => {
      const nbSync = nbSyncOf([nbPerson()]);
      const { service, contacts } = build({ job: nbJob(), nbSync });
      await service.processSyncQueueJob(nbPayload);
      expect(contacts.recordSourceRecord).toHaveBeenCalledWith(
        expect.objectContaining({ sourceSystem: "nation_builder:riverside", externalId: "12" }),
      );
    });

    it("skips the tag mirror when the connection turned importTags off", async () => {
      const nbSync = nbSyncOf([nbPerson()]);
      const { service, contactTags } = build({
        job: nbJob({ dataSync: { pull: { importTags: false } } }),
        nbSync,
      });
      await service.processSyncQueueJob(nbPayload);
      expect(contactTags.applyTag).not.toHaveBeenCalled();
    });

    it("a tag failure never fails the contact row", async () => {
      const nbSync = nbSyncOf([nbPerson()]);
      const { service, contactTags, prisma } = build({ job: nbJob(), nbSync });
      contactTags.applyTag.mockRejectedValue(new Error("tag store down"));
      const result = await service.processSyncQueueJob(nbPayload);
      // The row still landed and counted as synced — a tag mirror is best-effort.
      expect(result.syncedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(prisma.audienceContact.upsert).toHaveBeenCalled();
      // The failure is visible in the run's stats rather than swallowed.
      expect(result.stats?.reasonCounts).toMatchObject({ tag_apply_failed: 1 });
    });

    it("mirrors an NB do-not-contact flag into consent as OPTED_OUT on both channels", async () => {
      const nbSync = nbSyncOf([nbPerson({}, { do_not_call: true })]);
      const { service, consent } = build({ job: nbJob(), nbSync });
      await service.processSyncQueueJob(nbPayload);
      expect(consent.setState).toHaveBeenCalledTimes(2);
      expect(consent.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "org1",
          phoneE164: "+61400000000",
          state: "OPTED_OUT",
          source: "nation_builder_sync",
        }),
      );
    });

    it("never touches consent for a person with no opt-out signal", async () => {
      const nbSync = nbSyncOf([nbPerson()]);
      const { service, consent } = build({ job: nbJob(), nbSync });
      await service.processSyncQueueJob(nbPayload);
      expect(consent.setState).not.toHaveBeenCalled();
    });

    it("a consent-mirror failure never fails the contact row", async () => {
      const nbSync = nbSyncOf([nbPerson({}, { do_not_contact: true })]);
      const { service, consent } = build({ job: nbJob(), nbSync });
      consent.setState.mockRejectedValue(new Error("consent store down"));
      const result = await service.processSyncQueueJob(nbPayload);
      expect(result.syncedCount).toBe(1);
      expect(result.stats?.reasonCounts).toMatchObject({ consent_mirror_failed: 1 });
    });
  });

  // ── Checkpoint column (resume state out of errorSummary) ────────────────────
  describe("checkpoint column", () => {
    it("prefers the checkpoint column's cursor over the legacy errorSummary blob", async () => {
      const { service, actionNetwork } = build({
        job: baseJob({
          checkpoint: { nextCursorUrl: "https://an.example/next?page=9" },
          errorSummary: JSON.stringify({ nextCursorUrl: "https://an.example/stale?page=1" }),
        }),
      });
      await service.processSyncQueueJob({ ...payload, cursorUrl: undefined });
      expect(actionNetwork.syncList).toHaveBeenCalledWith(
        "apikey",
        expect.objectContaining({ cursorUrl: "https://an.example/next?page=9" }),
        undefined,
      );
    });

    it("still resumes a legacy row whose state lives only in errorSummary", async () => {
      const { service, actionNetwork } = build({
        job: baseJob({
          checkpoint: null,
          errorSummary: JSON.stringify({ nextCursorUrl: "https://an.example/legacy?page=4" }),
        }),
      });
      await service.processSyncQueueJob({ ...payload, cursorUrl: undefined });
      expect(actionNetwork.syncList).toHaveBeenCalledWith(
        "apikey",
        expect.objectContaining({ cursorUrl: "https://an.example/legacy?page=4" }),
        undefined,
      );
    });

    it("a FAILED run leaves the checkpoint untouched so the retry resumes mid-list", async () => {
      const { service, prisma } = build();
      prisma.audienceContact.upsert.mockRejectedValue(new Error("db down"));
      // Force a hard failure past the per-contact classifier by breaking the connector.
      const { service: failing, prisma: failingPrisma, actionNetwork } = build();
      actionNetwork.syncList.mockRejectedValue(new Error("provider down"));
      await expect(failing.processSyncQueueJob(payload)).rejects.toThrow("provider down");
      const failedUpdate = failingPrisma.integrationSyncJob.update.mock.calls.find(
        (c: any[]) => c[0]?.data?.status === "FAILED",
      );
      expect(failedUpdate).toBeDefined();
      // The failure record writes errorSummary but never the checkpoint key.
      expect(Object.keys(failedUpdate![0].data)).not.toContain("checkpoint");
      void service;
      void prisma;
    });
  });

  // ── Scheduled auto-refresh (cron sweep) ─────────────────────────────────────
  describe("dispatchDueRefreshes", () => {
    const staleDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const audienceRow = (over: Record<string, unknown> = {}) => ({
      id: "aud1",
      tenantId: "org1",
      name: "NationBuilder: Vols",
      source: "NATION_BUILDER",
      externalListId: "7",
      integrationConnectionId: "conn1",
      syncedAt: staleDate,
      ...over,
    });
    const activeConnection = (settings: unknown = {}) => ({
      id: "conn1",
      type: "NATION_BUILDER",
      settings,
    });

    function buildSweep(opts: {
      audiences?: unknown[];
      connections?: unknown[];
      liveJobs?: unknown[];
    }) {
      const built = build();
      built.prisma.audience.findMany = jest.fn().mockResolvedValue(opts.audiences ?? []);
      built.prisma.integrationConnection.findMany.mockResolvedValue(opts.connections ?? []);
      built.prisma.integrationSyncJob.findMany.mockResolvedValue(opts.liveJobs ?? []);
      const requestSpy = jest
        .spyOn(built.service, "requestSyncList")
        .mockResolvedValue({ syncJobId: "job2", queued: true } as any);
      return { ...built, requestSpy };
    }

    it("re-syncs a stale audience through its own connection", async () => {
      const { service, requestSpy } = buildSweep({
        audiences: [audienceRow()],
        connections: [activeConnection()],
      });
      const out = await service.dispatchDueRefreshes();
      expect(out).toEqual({ dispatched: 1, considered: 1 });
      expect(requestSpy).toHaveBeenCalledWith("org1", {
        type: "NATION_BUILDER",
        listId: "7",
        audienceName: "NationBuilder: Vols",
        connectionId: "conn1",
      });
    });

    it("skips an audience that already has a QUEUED/RUNNING job", async () => {
      const { service, requestSpy } = buildSweep({
        audiences: [audienceRow()],
        connections: [activeConnection()],
        liveJobs: [{ audienceId: "aud1" }],
      });
      const out = await service.dispatchDueRefreshes();
      expect(out.dispatched).toBe(0);
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it("skips a connection that turned auto-refresh off", async () => {
      const { service, requestSpy } = buildSweep({
        audiences: [audienceRow()],
        connections: [activeConnection({ dataSync: { pull: { autoRefresh: { enabled: false } } } })],
      });
      const out = await service.dispatchDueRefreshes();
      expect(out.dispatched).toBe(0);
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it("respects the connection's interval — freshly synced audiences wait", async () => {
      const { service, requestSpy } = buildSweep({
        // Synced 2h ago; connection asks for a 24h cadence.
        audiences: [audienceRow({ syncedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })],
        connections: [activeConnection({ dataSync: { pull: { autoRefresh: { enabled: true, intervalHours: 24 } } } })],
      });
      const out = await service.dispatchDueRefreshes();
      expect(out.dispatched).toBe(0);
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it("never refreshes through a disconnected connection", async () => {
      const { service, requestSpy } = buildSweep({
        audiences: [audienceRow()],
        connections: [], // ACTIVE filter returned nothing — connection is INACTIVE/gone
      });
      const out = await service.dispatchDueRefreshes();
      expect(out.dispatched).toBe(0);
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it("one audience's failure never stops the sweep", async () => {
      const { service, requestSpy } = buildSweep({
        audiences: [audienceRow(), audienceRow({ id: "aud2", externalListId: "8", name: "NB: Donors" })],
        connections: [activeConnection()],
      });
      requestSpy
        .mockRejectedValueOnce(new Error("token revoked"))
        .mockResolvedValueOnce({ syncJobId: "job3", queued: true } as any);
      const out = await service.dispatchDueRefreshes();
      expect(out.dispatched).toBe(1);
      expect(requestSpy).toHaveBeenCalledTimes(2);
    });
  });
});
