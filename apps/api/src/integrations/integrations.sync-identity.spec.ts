import { IntegrationsService } from "./integrations.service";

/**
 * M1 (meld doc 10): the Action Network sync must resolve the Contact spine,
 * stamp AudienceContact.contactId, record provenance, resolve cross-source
 * identity, and emit audience.imported on completion.
 */
describe("IntegrationsService — sync identity wiring", () => {
  function build() {
    const tx = {
      integrationSyncJob: { update: jest.fn().mockResolvedValue({}) },
      audience: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      integrationSyncJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: "job1",
          tenantId: "org1",
          status: "PENDING",
          syncedCount: 0,
          failedCount: 0,
          startedAt: null,
          errorSummary: null,
          audienceId: null,
          connection: {
            id: "conn1",
            type: "ACTION_NETWORK",
            encryptedCredential: "enc",
            settings: {},
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      audience: {
        create: jest.fn().mockResolvedValue({ id: "aud1" }),
        update: jest.fn().mockResolvedValue({}),
      },
      audienceContact: { upsert: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
    };
    const contacts = {
      getOrCreateByPhone: jest.fn().mockResolvedValue({ id: "c1" }),
      recordSourceRecord: jest.fn().mockResolvedValue(undefined),
      resolveIdentity: jest.fn().mockResolvedValue(null),
    };
    const outbox = { append: jest.fn().mockResolvedValue(undefined) };
    const actionNetwork = {
      syncList: jest.fn().mockResolvedValue({
        contacts: [
          {
            externalId: "an:1",
            name: "Ada Lovelace",
            phone: "+61400000000",
            metadata: {
              source: "ACTION_NETWORK",
              contactable: true,
              actionNetwork: {
                person: { email_addresses: [{ address: "Ada@Example.org", primary: true }] },
              },
            },
          },
        ],
        stats: {
          provider: "ACTION_NETWORK",
          listId: "list1",
          listName: "Vols",
          pagesFetched: 1,
          processedItems: 1,
          returnedContacts: 1,
          skippedNoPhone: 0,
          reasonCounts: {},
          nextCursorUrl: null,
        },
      }),
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
    );
    return { service, prisma, contacts, outbox };
  }

  it("resolves the spine, stamps contactId, records provenance + identity, emits the event", async () => {
    const { service, prisma, contacts, outbox } = build();

    await service.processSyncQueueJob({
      syncJobId: "job1",
      type: "ACTION_NETWORK",
      listId: "list1",
      audienceName: "Vols",
      listName: "Vols",
      run: 1,
    });

    expect(contacts.getOrCreateByPhone).toHaveBeenCalledWith("org1", "+61400000000", {
      fullName: "Ada Lovelace",
      email: "ada@example.org",
    });
    const upsertArg = prisma.audienceContact.upsert.mock.calls[0][0];
    expect(upsertArg.create.contactId).toBe("c1");
    expect(upsertArg.update.contactId).toBe("c1");
    expect(contacts.recordSourceRecord).toHaveBeenCalledWith({
      tenantId: "org1",
      contactId: "c1",
      sourceSystem: "action_network",
      externalId: "an:1",
    });
    expect(contacts.resolveIdentity).toHaveBeenCalledWith("org1", {
      email: "ada@example.org",
      phoneE164: "+61400000000",
    });
    const appendArg = outbox.append.mock.calls[0][1];
    expect(appendArg.eventType).toBe("audience.imported");
    expect(appendArg.aggregateId).toBe("aud1");
    expect(appendArg.payload).toEqual({ audienceId: "aud1", tenantId: "org1", count: 1 });
  });

  it("skips spine + provenance for a non-contactable row (no phone)", async () => {
    const { service, prisma, contacts } = build();
    // Override the connector to return a contact with no phone.
    (service as any).actionNetwork.syncList.mockResolvedValueOnce({
      contacts: [
        {
          externalId: "an:2",
          name: "No Phone",
          phone: "",
          metadata: { source: "ACTION_NETWORK", contactable: false },
        },
      ],
      stats: {
        provider: "ACTION_NETWORK",
        listId: "list1",
        listName: "Vols",
        pagesFetched: 1,
        processedItems: 1,
        returnedContacts: 1,
        skippedNoPhone: 1,
        reasonCounts: {},
        nextCursorUrl: null,
      },
    });

    await service.processSyncQueueJob({
      syncJobId: "job1",
      type: "ACTION_NETWORK",
      listId: "list1",
      audienceName: "Vols",
      run: 1,
    });

    expect(contacts.getOrCreateByPhone).not.toHaveBeenCalled();
    expect(contacts.recordSourceRecord).not.toHaveBeenCalled();
    const upsertArg = prisma.audienceContact.upsert.mock.calls[0][0];
    expect(upsertArg.create.contactId).toBeUndefined();
  });
});
