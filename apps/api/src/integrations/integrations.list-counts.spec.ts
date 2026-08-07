import { IntegrationsService } from "./integrations.service";

/**
 * Last-sync count fallback on the list picker.
 *
 * Action Network's list resource carries no membership count, and its items collection
 * deliberately omits `total_records` – so every AN list rendered as "—" in the picker.
 * `searchLists` now fills the gap from this tenant's most recent SUCCEEDED sync of the
 * same list on the same connection, labelled `countSource: "last_sync"`. These tests
 * lock down the fill, its scoping, and that provider-supplied counts are never touched.
 */
describe("IntegrationsService — list count fallback", () => {
  const activeRow = () => ({
    id: "conn1",
    tenantId: "org1",
    type: "ACTION_NETWORK",
    name: "Action Network",
    status: "ACTIVE",
    encryptedCredential: "enc:tenant-own-key",
    settings: null,
    updatedAt: new Date("2026-07-01T00:00:00Z"),
  });

  function build(remoteLists: Array<Record<string, unknown>>) {
    const prisma: any = {
      integrationConnection: {
        findFirst: jest.fn().mockResolvedValue(activeRow()),
      },
      integrationSyncJob: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const crypto = {
      decrypt: jest.fn((blob: string) => String(blob).replace(/^enc:/, "")),
    };
    const actionNetwork = {
      searchLists: jest.fn().mockResolvedValue(remoteLists),
    };
    const service = new IntegrationsService(
      prisma,
      { get: (_k: string, d?: unknown) => d } as any,
      crypto as any,
      actionNetwork as any,
      { searchLists: jest.fn() } as any,
      { searchLists: jest.fn() } as any,
      { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
      {} as any,
      {} as any,
      { enqueue: jest.fn() } as any,
    );
    return { service, prisma, actionNetwork };
  }

  it("fills an uncounted list from the latest successful sync and labels the source", async () => {
    const { service, prisma } = build([
      { id: "l1", name: "Volunteers", source: "ACTION_NETWORK" },
      { id: "l2", name: "Donors", source: "ACTION_NETWORK" },
    ]);
    prisma.integrationSyncJob.findMany.mockResolvedValue([
      { remoteListId: "l1", syncedCount: 342 },
    ]);

    const { lists } = await service.searchLists("org1", { type: "ACTION_NETWORK" } as any);

    expect(lists[0]).toEqual(
      expect.objectContaining({ id: "l1", count: 342, countSource: "last_sync" }),
    );
    // Never synced → honestly uncounted, the UI keeps its dash.
    expect(lists[1].count).toBeUndefined();
    expect(lists[1].countSource).toBeUndefined();
  });

  it("scopes the lookup to the tenant, connection, SUCCEEDED status and the uncounted ids only", async () => {
    const { service, prisma } = build([
      { id: "l1", name: "Counted", count: 10, source: "ACTION_NETWORK" },
      { id: "l2", name: "Uncounted", source: "ACTION_NETWORK" },
    ]);

    await service.searchLists("org1", { type: "ACTION_NETWORK" } as any);

    expect(prisma.integrationSyncJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "org1",
          integrationConnectionId: "conn1",
          status: "SUCCEEDED",
          remoteListId: { in: ["l2"] },
        },
        orderBy: { createdAt: "desc" },
        distinct: ["remoteListId"],
      }),
    );
  });

  it("leaves provider-supplied counts untouched and skips the query when every list is counted", async () => {
    const { service, prisma } = build([
      { id: "l1", name: "NB list", count: 55, source: "NATION_BUILDER" },
    ]);

    const { lists } = await service.searchLists("org1", { type: "ACTION_NETWORK" } as any);

    expect(lists[0].count).toBe(55);
    expect(lists[0].countSource).toBeUndefined();
    expect(prisma.integrationSyncJob.findMany).not.toHaveBeenCalled();
  });

  it("keeps lists uncounted when no successful sync exists", async () => {
    const { service } = build([{ id: "l9", name: "Never synced", source: "ACTION_NETWORK" }]);

    const { lists } = await service.searchLists("org1", { type: "ACTION_NETWORK" } as any);

    expect(lists[0].count).toBeUndefined();
    expect(lists[0].countSource).toBeUndefined();
  });
});
