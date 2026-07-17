import { DEFAULT_SEGMENT_POLICY } from "@uprise/segmentation";
import { SegmentEvaluatorService } from "./segment-evaluator.service";

const V2_DEFINITION = {
  format: 2,
  filter: {
    kind: "all",
    children: [{ kind: "condition", condition: { type: "tag.tagged", op: "in", values: ["t1"] } }],
  },
  policy: DEFAULT_SEGMENT_POLICY,
};

function setup(definition: unknown, channel: string | null = "SMS") {
  const created: Array<{ segmentId: string; contactId: string }> = [];
  const prisma: any = {
    audienceSegment: {
      findUnique: jest.fn(async () => ({
        id: "seg1",
        tenantId: "t1",
        definition,
        audience: { channel },
      })),
      update: jest.fn(async () => ({})),
    },
    audienceSegmentMember: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async ({ data }: any) => {
        created.push(...data);
        return { count: data.length };
      }),
    },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const logger = { debug: jest.fn(), warn: jest.fn() } as any;
  const outbox = { append: jest.fn(async () => undefined) } as any;
  const insights = {} as any;
  const leafResolver = {
    universe: jest.fn(async () => new Set(["c1", "c2", "c3"])),
    resolveLeaves: jest.fn(async (_t: string, leaves: any[]) => ({
      resolved: new Map(
        leaves.map((leaf: any) => [
          leaf,
          leaf.kind === "condition" && leaf.condition.type === "tag.tagged"
            ? new Set(["c1", "c2"])
            : new Set(["c1", "c2", "c3"]), // compliance floor passes everyone here
        ]),
      ),
      clauseErrors: [],
    })),
  } as any;
  const svc = new SegmentEvaluatorService(prisma, logger, outbox, insights, leafResolver);
  return { svc, prisma, created, outbox, leafResolver };
}

describe("SegmentEvaluatorService — v2 (engine) routing", () => {
  it("routes a format:2 definition through compose → resolve → fold and materialises the sendable set", async () => {
    const { svc, prisma, created, leafResolver } = setup(V2_DEFINITION);
    const { count } = await svc.evaluate("seg1");

    expect(count).toBe(2);
    expect(new Set(created.map((m) => m.contactId))).toEqual(new Set(["c1", "c2"]));
    expect(leafResolver.universe).toHaveBeenCalledWith("t1");
    // v2 stamps evaluation freshness inside the same transaction.
    expect(prisma.audienceSegment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastEvaluatedAt: expect.any(Date) }) }),
    );
  });

  it("derives the compliance channel from the container audience (WHATSAPP)", async () => {
    const { svc, leafResolver } = setup(V2_DEFINITION, "WHATSAPP");
    await svc.evaluate("seg1");
    const leaves = leafResolver.resolveLeaves.mock.calls[0][1];
    const consentLeaf = leaves.find(
      (l: any) => l.kind === "condition" && l.condition.type === "compliance.channelConsent",
    );
    expect(consentLeaf.condition.channel).toBe("WHATSAPP");
  });

  it("fails loud (throws) on a corrupt v2 envelope rather than silently emptying the audience", async () => {
    const { svc } = setup({ format: 2, filter: { kind: "??" }, policy: {} });
    await expect(svc.evaluate("seg1")).rejects.toThrow();
  });

  it("emits audience.segment.recomputed with the v2 count", async () => {
    const { svc, outbox, prisma } = setup(V2_DEFINITION);
    await svc.evaluate("seg1");
    expect(outbox.append).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        eventType: "audience.segment.recomputed",
        payload: expect.objectContaining({ memberCount: 2 }),
      }),
    );
  });
});
