import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DEFAULT_SEGMENT_POLICY } from "@uprise/segmentation";
import { SegmentsService } from "./segments.service";

const FILTER = {
  kind: "all",
  children: [{ kind: "condition", condition: { type: "tag.tagged", op: "in", values: ["t1"] } }],
};

function setup() {
  const segmentRow = {
    id: "seg1",
    audienceId: "aud1",
    name: "Reef supporters",
    definition: { format: 2, filter: FILTER, policy: DEFAULT_SEGMENT_POLICY },
    version: 1,
    seed: "seed1",
    archivedAt: null,
    lastEvaluatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { members: 42 },
  };
  const prisma: any = {
    audience: {
      create: jest.fn(async ({ data }: any) => ({ id: "aud1", ...data })),
      update: jest.fn(async () => ({})),
    },
    audienceSegment: {
      create: jest.fn(async ({ data }: any) => ({ ...segmentRow, ...data, id: "seg1" })),
      update: jest.fn(async () => ({})),
      findFirst: jest.fn(async () => segmentRow),
      findMany: jest.fn(async () => [segmentRow]),
    },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const outbox = { append: jest.fn(async () => undefined) } as any;
  const customQuery = { resolveContacts: jest.fn() } as any;
  const queue = { enqueue: jest.fn(async () => ({ jobId: "j", queued: true })) } as any;
  const svc = new SegmentsService(prisma, outbox, customQuery, queue);
  return { svc, prisma, outbox, queue, segmentRow };
}

describe("SegmentsService — engine-v2 CRUD", () => {
  it("create: container audience + v2 envelope + outbox event + eval enqueue, atomically", async () => {
    const { svc, prisma, outbox, queue } = setup();
    await svc.create("t1", "u1", { name: "Reef supporters", filter: FILTER });

    // Container-audience pattern: one DYNAMIC_SEGMENT audience per segment.
    expect(prisma.audience.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "t1", kind: "DYNAMIC_SEGMENT", source: "INTERNAL" }),
      }),
    );
    const segmentData = prisma.audienceSegment.create.mock.calls[0][0].data;
    expect(segmentData.definition).toMatchObject({ format: 2, filter: FILTER });
    expect(segmentData.seed).toMatch(/^\S+$/); // whitespace-free (a hash-key segment)
    // Outbox event inside the same $transaction callback (tx === prisma here).
    expect(outbox.append).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ eventType: "audience.segment.created" }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ queue: "segment-eval", payload: { segmentId: "seg1" } }),
    );
  });

  it("create: refuses a missing name / invalid filter / L3 smuggling / unsupported capability", async () => {
    const { svc } = setup();
    await expect(svc.create("t1", null, { filter: FILTER })).rejects.toThrow(BadRequestException);
    await expect(
      svc.create("t1", null, { name: "x", filter: { kind: "??" } }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      svc.create("t1", null, {
        name: "x",
        filter: {
          kind: "all",
          children: [
            { kind: "condition", condition: { type: "compliance.channelConsent", channel: "SMS" } },
          ],
        },
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      svc.create("t1", null, {
        name: "x",
        filter: {
          kind: "all",
          children: [
            { kind: "condition", condition: { type: "contact.ageBand", op: "in", values: ["18-24"] } },
          ],
        },
      }),
    ).rejects.toThrow(BadRequestException); // gated capability
  });

  it("create: refuses a custom clause whose predicate fails the AST gate", async () => {
    const { svc } = setup();
    await expect(
      svc.create("t1", null, {
        name: "x",
        filter: {
          kind: "all",
          children: [{ kind: "condition", condition: { type: "custom.clause", clauseRef: "cq1" } }],
        },
        customClauses: [
          { id: "cq1", label: "bad", intent: "bad", predicate: "true; drop table x" },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("create: refuses a dangling custom.clause reference", async () => {
    const { svc } = setup();
    await expect(
      svc.create("t1", null, {
        name: "x",
        filter: {
          kind: "all",
          children: [{ kind: "condition", condition: { type: "custom.clause", clauseRef: "nope" } }],
        },
        customClauses: [{ id: "cq1", label: "l", intent: "i", predicate: "state = 'NSW'" }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("update: bumps version, mirrors the name onto the container audience, emits + re-enqueues", async () => {
    const { svc, prisma, outbox, queue } = setup();
    await svc.update("t1", "seg1", { name: "Renamed" });

    expect(prisma.audienceSegment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 2, name: "Renamed" }) }),
    );
    expect(prisma.audience.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "aud1" }, data: { name: "Renamed" } }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        eventType: "audience.segment.updated",
        payload: expect.objectContaining({ version: 2 }),
      }),
    );
    expect(queue.enqueue).toHaveBeenCalled();
  });

  it("archive/restore: stamps both rows + emits", async () => {
    const { svc, prisma, outbox } = setup();
    await svc.archive("t1", "seg1");
    expect(prisma.audience.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ARCHIVED" }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        eventType: "audience.segment.archived",
        payload: expect.objectContaining({ archived: true }),
      }),
    );
  });

  it("get/list: 404 on a missing segment; summaries carry counts + plain-English description", async () => {
    const { svc, prisma } = setup();
    const rows = await svc.list("t1");
    expect(rows[0]).toMatchObject({ id: "seg1", memberCount: 42 });
    expect(rows[0].summary).toContain("Tagged");

    prisma.audienceSegment.findFirst.mockResolvedValueOnce(null);
    await expect(svc.get("t1", "missing")).rejects.toThrow(NotFoundException);
  });

  it("entityFeeds: hydrates every picker feed, tenant-scoped", async () => {
    const { svc, prisma } = setup();
    prisma.contactTag = { findMany: jest.fn(async () => [{ id: "tg1", label: "Climate" }]) };
    prisma.turf = { findMany: jest.fn(async () => [{ id: "t1", name: "Marrickville" }]) };
    prisma.survey = { findMany: jest.fn(async () => [{ id: "s1", name: "Doors 2026" }]) };
    prisma.question = {
      findMany: jest.fn(async () => [
        { id: "q1", prompt: "Support?", surveyId: "s1", options: [{ value: "yes", label: "Yes" }] },
      ]),
    };
    prisma.event = { findMany: jest.fn(async () => [{ id: "e1", title: "Rally" }]) };
    prisma.blast = { findMany: jest.fn(async () => [{ id: "b1", title: "GOTV" }]) };
    prisma.journey = { findMany: jest.fn(async () => [{ id: "j1", name: "Welcome" }]) };
    prisma.dispositionDef = { findMany: jest.fn(async () => [{ code: "MEANINGFUL", label: "Meaningful" }]) };
    prisma.contactSourceRecord = { findMany: jest.fn(async () => [{ sourceSystem: "csv" }]) };

    const feeds = await svc.entityFeeds("t1");
    expect(feeds.tags).toEqual([{ value: "tg1", label: "Climate" }]);
    expect(feeds.questions[0]).toMatchObject({ value: "q1", surveyId: "s1" });
    expect(feeds.sources).toEqual([{ value: "csv", label: "csv" }]);
    expect(prisma.contactTag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "t1" } }),
    );
  });

  it("evaluate: verifies tenancy then enqueues", async () => {
    const { svc, prisma, queue } = setup();
    await svc.evaluate("t1", "seg1");
    expect(queue.enqueue).toHaveBeenCalled();
    prisma.audienceSegment.findFirst.mockResolvedValueOnce(null);
    await expect(svc.evaluate("t1", "nope")).rejects.toThrow(NotFoundException);
  });
});
