import { ApiKeysService } from "./api-keys.service";

function makePrisma(overrides: Record<string, any> = {}) {
  const base: any = {
    apiKey: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(async ({ data }: any) => ({ id: "k1", name: data.name, prefix: data.prefix })),
      update: jest.fn(async ({ data }: any) => ({ id: "k1", revokedAt: data.revokedAt })),
    },
    ...overrides,
  };
  base.$transaction = jest.fn(async (fn: any) => fn(base));
  return base;
}

describe("ApiKeysService", () => {
  let prisma: any;
  let outbox: any;
  let service: ApiKeysService;

  beforeEach(() => {
    prisma = makePrisma();
    outbox = { append: jest.fn() };
    service = new ApiKeysService(prisma, outbox);
  });

  describe("list", () => {
    it("returns non-revoked keys newest-first without the hash", async () => {
      await service.list("t1");
      const call = prisma.apiKey.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ tenantId: "t1", revokedAt: null });
      expect(call.orderBy).toEqual({ createdAt: "desc" });
      expect(call.select.keyHash).toBeUndefined();
      expect(call.select.id).toBe(true);
    });
  });

  describe("issue", () => {
    it("mints a hashed key, emits the issued event in the transaction, and returns the plaintext once", async () => {
      const res = await service.issue("t1", { name: "CI token" });

      // Plaintext returned exactly once, with the yk_ scheme and a display prefix.
      expect(res.key).toMatch(/^yk_[0-9a-f]{48}$/);
      expect(res.name).toBe("CI token");

      // Only the non-secret prefix + hash are persisted (never the plaintext/hash in the response).
      const createData = prisma.apiKey.create.mock.calls[0][0].data;
      expect(createData.tenantId).toBe("t1");
      expect(createData.keyHash).toMatch(/^[0-9a-f]{64}$/);
      expect(createData.prefix.startsWith("yk_")).toBe(true);
      expect((res as any).keyHash).toBeUndefined();

      // Event appended atomically on the transaction client.
      expect(outbox.append).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          tenantId: "t1",
          eventType: "tenant.api-key.issued",
          aggregateId: "k1",
          payload: expect.objectContaining({ apiKeyId: "k1", tenantId: "t1", name: "CI token" }),
        }),
      );
    });

    it("generates a distinct plaintext each time", async () => {
      const a = await service.issue("t1", { name: "a" });
      const b = await service.issue("t1", { name: "b" });
      expect(a.key).not.toBe(b.key);
    });
  });

  describe("revoke", () => {
    it("throws NotFoundException for a key outside the tenant", async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);
      await expect(service.revoke("t1", "ghost")).rejects.toThrow("API key not found");
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
    });

    it("soft-revokes and emits the revoked event", async () => {
      prisma.apiKey.findFirst.mockResolvedValue({ id: "k1", tenantId: "t1", revokedAt: null });
      await service.revoke("t1", "k1");
      const data = prisma.apiKey.update.mock.calls[0][0].data;
      expect(data.revokedAt).toBeInstanceOf(Date);
      expect(outbox.append).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ eventType: "tenant.api-key.revoked", aggregateId: "k1" }),
      );
    });

    it("is idempotent: preserves the original revokedAt for an already-revoked key", async () => {
      const revokedAt = new Date("2026-01-01T00:00:00Z");
      prisma.apiKey.findFirst.mockResolvedValue({ id: "k1", tenantId: "t1", revokedAt });
      await service.revoke("t1", "k1");
      expect(prisma.apiKey.update.mock.calls[0][0].data.revokedAt).toBe(revokedAt);
    });
  });
});
