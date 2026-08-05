import { IntegrationsService } from "./integrations.service";
import { IntegrationNotConnectedError, IntegrationValidationError } from "./integration.errors";

/**
 * Connection resolution + credential handling — the containment boundary.
 *
 * The bug this locks down: `ACTION_NETWORK_API_KEY` was a required, process-wide env var,
 * and the read path lazily CREATED an IntegrationConnection for any tenant seeded from it.
 * So every tenant that opened the audience page was silently connected to whichever
 * organisation's key happened to be in env, saw their remote lists, and could import their
 * people. Three separate things had to be true for that to happen; each has a test here:
 *
 *  1. a read path was allowed to create a connection    → "never creates"
 *  2. a blank API key silently meant "use the env one"  → "blank key on create"
 *  3. that recreation undid Disconnect on next page load → "disconnect is durable"
 */
describe("IntegrationsService — connection resolution", () => {
  const ENV: Record<string, string> = {
    // Present on purpose: these used to be the fallback. Nothing may read them now.
    ACTION_NETWORK_API_KEY: "platform-key-that-must-never-be-used",
    INTERNAL_SOURCE_API_KEY: "platform-internal-key",
    ACTION_NETWORK_API_BASE_URL: "https://actionnetwork.org/api/v2",
    INTERNAL_SOURCE_API_BASE_URL: "https://internal.example/api",
  };

  const activeRow = (over: Record<string, unknown> = {}) => ({
    id: "conn1",
    tenantId: "org1",
    type: "ACTION_NETWORK",
    name: "Action Network",
    status: "ACTIVE",
    encryptedCredential: "enc:tenant-own-key",
    settings: null,
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...over,
  });

  function build() {
    const prisma: any = {
      integrationConnection: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(async ({ create, update }: any) => ({
          id: "conn1",
          type: "ACTION_NETWORK",
          name: (create ?? update).name,
          status: "ACTIVE",
          updatedAt: new Date(),
        })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const crypto = {
      encrypt: jest.fn((plain: string) => `enc:${plain}`),
      decrypt: jest.fn((blob: string) => String(blob).replace(/^enc:/, "")),
    };
    const actionNetwork = {
      testConnection: jest.fn().mockResolvedValue({ ok: true }),
      searchLists: jest.fn().mockResolvedValue([{ id: "l1", name: "Volunteers" }]),
      sampleListContacts: jest.fn().mockResolvedValue([]),
    };
    const internalSource = {
      testConnection: jest.fn().mockResolvedValue({ ok: true }),
      searchLists: jest.fn().mockResolvedValue([]),
      sampleListContacts: jest.fn().mockResolvedValue([]),
    };
    const nationBuilder = {
      testConnection: jest.fn().mockResolvedValue({ ok: true }),
      searchLists: jest.fn().mockResolvedValue([]),
      sampleListContacts: jest.fn().mockResolvedValue([]),
    };
    const service = new IntegrationsService(
      prisma,
      { get: (k: string, d?: unknown) => ENV[k] ?? d } as any,
      crypto as any,
      actionNetwork as any,
      internalSource as any,
      nationBuilder as any,
      { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
      {} as any,
      {} as any,
      { enqueue: jest.fn() } as any,
    );
    return { service, prisma, crypto, actionNetwork, internalSource, nationBuilder };
  }

  // ── 1. A read path never creates a connection ──────────────────────────────
  it("searchLists throws NOT_CONNECTED instead of auto-creating from the env key", async () => {
    const { service, prisma, actionNetwork } = build();
    await expect(
      service.searchLists("org1", { type: "ACTION_NETWORK" } as any),
    ).rejects.toBeInstanceOf(IntegrationNotConnectedError);
    expect(prisma.integrationConnection.upsert).not.toHaveBeenCalled();
    expect(actionNetwork.searchLists).not.toHaveBeenCalled();
  });

  it("sampleList throws NOT_CONNECTED instead of auto-creating from the env key", async () => {
    const { service, prisma } = build();
    await expect(
      service.sampleList("org1", { type: "ACTION_NETWORK", listId: "l1" } as any),
    ).rejects.toBeInstanceOf(IntegrationNotConnectedError);
    expect(prisma.integrationConnection.upsert).not.toHaveBeenCalled();
  });

  it("reads through the tenant's own credential, never the platform env key", async () => {
    const { service, prisma, actionNetwork } = build();
    prisma.integrationConnection.findFirst.mockResolvedValue(activeRow());
    await service.searchLists("org1", { type: "ACTION_NETWORK", query: "vol" } as any);
    expect(actionNetwork.searchLists).toHaveBeenCalledWith(
      "tenant-own-key",
      { query: "vol", limit: 25 },
      "https://actionnetwork.org/api/v2",
    );
    expect(prisma.integrationConnection.upsert).not.toHaveBeenCalled();
  });

  it("scopes an explicit connectionId to the calling tenant", async () => {
    const { service, prisma } = build();
    await expect(
      service.searchLists("org1", { type: "ACTION_NETWORK", connectionId: "someone-elses" } as any),
    ).rejects.toBeInstanceOf(IntegrationNotConnectedError);
    expect(prisma.integrationConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "someone-elses", tenantId: "org1", status: "ACTIVE" },
      }),
    );
  });

  // ── 2. A blank API key is never silently substituted ───────────────────────
  it("rejects a create with no API key rather than falling back to env", async () => {
    const { service, prisma } = build();
    await expect(
      service.upsertConnection("org1", { type: "ACTION_NETWORK", name: "AN" } as any),
    ).rejects.toBeInstanceOf(IntegrationValidationError);
    expect(prisma.integrationConnection.upsert).not.toHaveBeenCalled();
  });

  it("stores the supplied key encrypted on create", async () => {
    const { service, prisma, crypto } = build();
    await service.upsertConnection("org1", {
      type: "ACTION_NETWORK",
      name: "AN",
      apiKey: "  my-own-key  ",
    } as any);
    expect(crypto.encrypt).toHaveBeenCalledWith("my-own-key");
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_type_externalGroup: { tenantId: "org1", type: "ACTION_NETWORK", externalGroup: "" },
        },
        create: expect.objectContaining({ encryptedCredential: "enc:my-own-key", externalGroup: "" }),
      }),
    );
  });

  it("keys Action Network connections per group — a second group is its own create", async () => {
    const { service, prisma } = build();
    await service.upsertConnection("org1", {
      type: "ACTION_NETWORK",
      name: "AN Victoria",
      apiKey: "vic-key",
      group: "  Riverside West  ",
    } as any);
    expect(prisma.integrationConnection.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_type_externalGroup: {
            tenantId: "org1",
            type: "ACTION_NETWORK",
            externalGroup: "Riverside West",
          },
        },
      }),
    );
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_type_externalGroup: {
            tenantId: "org1",
            type: "ACTION_NETWORK",
            externalGroup: "Riverside West",
          },
        },
        create: expect.objectContaining({ externalGroup: "Riverside West" }),
      }),
    );
  });

  it("a new group with no API key is a create and is rejected — the other group's key is never borrowed", async () => {
    const { service, prisma } = build();
    // The tenant has a different group connected; the lookup for THIS group finds nothing.
    prisma.integrationConnection.findUnique.mockResolvedValue(null);
    await expect(
      service.upsertConnection("org1", {
        type: "ACTION_NETWORK",
        name: "AN NSW",
        group: "Riverside North",
      } as any),
    ).rejects.toBeInstanceOf(IntegrationValidationError);
    expect(prisma.integrationConnection.upsert).not.toHaveBeenCalled();
  });

  it("NationBuilder requires the nation slug and derives the endpoint from it", async () => {
    const { service, prisma } = build();
    await expect(
      service.upsertConnection("org1", {
        type: "NATION_BUILDER",
        name: "Nation",
        apiKey: "nb-token",
      } as any),
    ).rejects.toBeInstanceOf(IntegrationValidationError);

    await service.upsertConnection("org1", {
      type: "NATION_BUILDER",
      name: "Riverside nation",
      apiKey: "nb-token",
      group: "Riverside",
    } as any);
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_type_externalGroup: { tenantId: "org1", type: "NATION_BUILDER", externalGroup: "Riverside" },
        },
        create: expect.objectContaining({
          externalGroup: "Riverside",
          settings: { baseUrl: "https://riverside.nationbuilder.com" },
        }),
      }),
    );
  });

  it("an internal source ignores group and stays keyed one per type", async () => {
    const { service, prisma } = build();
    await service.upsertConnection("org1", {
      type: "INTERNAL",
      name: "Warehouse",
      apiKey: "internal-key",
      baseUrl: "https://internal.example/api",
      group: "should-be-ignored",
    } as any);
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_type_externalGroup: { tenantId: "org1", type: "INTERNAL", externalGroup: "" },
        },
      }),
    );
  });

  it("keeps the stored key when updating with a blank one", async () => {
    const { service, prisma, crypto } = build();
    prisma.integrationConnection.findUnique.mockResolvedValue({
      id: "conn1",
      encryptedCredential: "enc:tenant-own-key",
      settings: null,
    });
    await service.upsertConnection("org1", { type: "ACTION_NETWORK", name: "Renamed" } as any);
    expect(crypto.encrypt).not.toHaveBeenCalled();
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          name: "Renamed",
          encryptedCredential: "enc:tenant-own-key",
        }),
      }),
    );
  });

  it("requires a base URL for an internal source", async () => {
    const { service } = build();
    const cfgless = new IntegrationsService(
      { integrationConnection: { findUnique: jest.fn().mockResolvedValue(null) } } as any,
      { get: (_k: string, d?: unknown) => d } as any,
      { encrypt: (s: string) => s, decrypt: (s: string) => s } as any,
      {} as any,
      {} as any,
      {} as any,
      { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
      {} as any,
      {} as any,
      { enqueue: jest.fn() } as any,
    );
    expect(service).toBeDefined();
    await expect(
      cfgless.upsertConnection("org1", { type: "INTERNAL", name: "Src", apiKey: "k" } as any),
    ).rejects.toBeInstanceOf(IntegrationValidationError);
  });

  // ── 3. Disconnect is durable ───────────────────────────────────────────────
  it("a read after Disconnect stays disconnected and does not resurrect the row", async () => {
    const { service, prisma } = build();
    prisma.integrationConnection.updateMany.mockResolvedValue({ count: 1 });
    await service.setConnectionStatus("org1", "conn1", "INACTIVE" as any);

    // resolveConnection filters on ACTIVE, so the next read finds nothing …
    prisma.integrationConnection.findFirst.mockResolvedValue(null);
    await expect(
      service.searchLists("org1", { type: "ACTION_NETWORK" } as any),
    ).rejects.toBeInstanceOf(IntegrationNotConnectedError);
    // … and, crucially, does not write it back to ACTIVE.
    expect(prisma.integrationConnection.upsert).not.toHaveBeenCalled();
  });

  // ── testConnection ─────────────────────────────────────────────────────────
  it("testConnection uses the supplied key without touching the database", async () => {
    const { service, prisma, actionNetwork } = build();
    const res = await service.testConnection("org1", {
      type: "ACTION_NETWORK",
      apiKey: "candidate-key",
    } as any);
    expect(actionNetwork.testConnection).toHaveBeenCalledWith(
      "candidate-key",
      "https://actionnetwork.org/api/v2",
    );
    expect(prisma.integrationConnection.findFirst).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, type: "ACTION_NETWORK" });
  });

  it("testConnection with no key tests the tenant's stored credential", async () => {
    const { service, prisma, actionNetwork } = build();
    prisma.integrationConnection.findFirst.mockResolvedValue(activeRow());
    await service.testConnection("org1", { type: "ACTION_NETWORK" } as any);
    expect(actionNetwork.testConnection).toHaveBeenCalledWith(
      "tenant-own-key",
      "https://actionnetwork.org/api/v2",
    );
  });

  it("testConnection with no key and no connection reports NOT_CONNECTED", async () => {
    const { service } = build();
    await expect(
      service.testConnection("org1", { type: "ACTION_NETWORK" } as any),
    ).rejects.toBeInstanceOf(IntegrationNotConnectedError);
  });

  // ── base URL precedence ────────────────────────────────────────────────────
  it("prefers a per-connection base URL over the platform default", async () => {
    const { service, prisma, actionNetwork } = build();
    prisma.integrationConnection.findFirst.mockResolvedValue(
      activeRow({ settings: { baseUrl: "https://an.test/api/v2" } }),
    );
    await service.searchLists("org1", { type: "ACTION_NETWORK" } as any);
    expect(actionNetwork.searchLists).toHaveBeenCalledWith(
      "tenant-own-key",
      { query: undefined, limit: 25 },
      "https://an.test/api/v2",
    );
  });
});
