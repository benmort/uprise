import { AudiencesService } from "./audiences.service";

/**
 * Unit-covers the dynamic-segment surface added to AudiencesService:
 * ensureImportSegment (create/reuse + segment-eval enqueue) and listSegments.
 * Positional `new` construction with mocked prisma + queue (testing-unit.md).
 */
function setup() {
  const prisma: any = {
    audience: { findFirst: jest.fn() },
    audienceSegment: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
  };
  const config: any = { get: (_k: string, d?: unknown) => d };
  const queue = { enqueue: jest.fn().mockResolvedValue({ jobId: "q1", queued: true }) };
  const svc = new AudiencesService(prisma, config, undefined, queue as any);
  return { svc, prisma, queue };
}

describe("AudiencesService — dynamic segments", () => {
  describe("ensureImportSegment", () => {
    it("returns null when the audience no longer exists", async () => {
      const { svc, prisma } = setup();
      prisma.audience.findFirst.mockResolvedValue(null);
      expect(await svc.ensureImportSegment("org1", "audX")).toBeNull();
      expect(prisma.audienceSegment.create).not.toHaveBeenCalled();
    });

    it("creates the 'Imported contacts' DYNAMIC segment with a hasSource definition + enqueues eval", async () => {
      const { svc, prisma, queue } = setup();
      prisma.audience.findFirst.mockResolvedValue({ id: "aud1", source: "ACTION_NETWORK" });
      prisma.audienceSegment.findFirst.mockResolvedValue(null);
      prisma.audienceSegment.create.mockResolvedValue({ id: "seg1" });

      const res = await svc.ensureImportSegment("org1", "aud1");

      expect(prisma.audienceSegment.create.mock.calls[0][0].data).toMatchObject({
        tenantId: "org1",
        audienceId: "aud1",
        name: "Imported contacts",
        type: "DYNAMIC",
        definition: { type: "hasSource", sourceSystem: "action_network" },
      });
      expect(queue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          queue: "segment-eval",
          id: "segment-eval_seg1",
          payload: { segmentId: "seg1" },
        }),
      );
      expect(res).toEqual({ segmentId: "seg1", created: true });
    });

    it("reuses an existing segment (idempotent) and still re-enqueues eval", async () => {
      const { svc, prisma, queue } = setup();
      prisma.audience.findFirst.mockResolvedValue({ id: "aud1", source: "INTERNAL" });
      prisma.audienceSegment.findFirst.mockResolvedValue({ id: "segExisting" });

      const res = await svc.ensureImportSegment("org1", "aud1");

      expect(prisma.audienceSegment.create).not.toHaveBeenCalled();
      expect(queue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ id: "segment-eval_segExisting" }),
      );
      expect(res).toEqual({ segmentId: "segExisting", created: false });
    });
  });

  describe("listSegments", () => {
    it("flattens rows with member counts + parent audience info", async () => {
      const { svc, prisma } = setup();
      prisma.audienceSegment.findMany.mockResolvedValue([
        {
          id: "seg1",
          name: "Imported contacts",
          type: "DYNAMIC",
          audienceId: "aud1",
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          _count: { members: 42 },
          audience: { id: "aud1", name: "Action Network: Vols", source: "ACTION_NETWORK", syncedAt: null },
        },
      ]);

      const rows = await svc.listSegments("org1");

      expect(prisma.audienceSegment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "org1" } }),
      );
      expect(rows[0]).toMatchObject({
        id: "seg1",
        name: "Imported contacts",
        type: "DYNAMIC",
        audienceId: "aud1",
        audienceName: "Action Network: Vols",
        source: "ACTION_NETWORK",
        memberCount: 42,
      });
    });
  });
});
