import { BadRequestException } from "@nestjs/common";
import { DEFAULT_SEGMENT_POLICY } from "@uprise/segmentation";
import { SegmentsController } from "./segments.controller";
import {
  CompileCustomClauseDto,
  CreateSegmentDto,
  GenerateSegmentDto,
  PreviewSegmentDto,
  UpdateSegmentDto,
} from "./dto/segment.dto";

const FILTER = {
  kind: "all",
  children: [{ kind: "condition", condition: { type: "tag.tagged", op: "in", values: ["t"] } }],
};

function setup() {
  const segments = {
    entityFeeds: jest.fn(async () => ({ tags: [], turfs: [] })),
    list: jest.fn(async () => []),
    get: jest.fn(async () => ({ id: "seg1" })),
    create: jest.fn(async () => ({ id: "seg1" })),
    update: jest.fn(async () => ({ id: "seg1" })),
    archive: jest.fn(async () => ({ id: "seg1", archived: true })),
    restore: jest.fn(async () => ({ id: "seg1", archived: false })),
    evaluate: jest.fn(async () => ({ queued: true })),
  } as any;
  const preview = { preview: jest.fn(async () => ({ total: 0, sample: [] })) } as any;
  const authoring = { generateFromPrompt: jest.fn(async () => ({ name: "n", tree: FILTER })) } as any;
  const customQuery = {
    compileCustomClause: jest.fn(async () => ({ status: "ok", predicate: "p", reasons: [], count: 1 })),
  } as any;
  const controller = new SegmentsController(segments, preview, authoring, customQuery);
  return { controller, segments, preview, authoring, customQuery };
}

describe("SegmentsController", () => {
  it("catalogue merges the describe view with tenant feeds", async () => {
    const { controller, segments } = setup();
    const result = await controller.catalogue("t1");
    expect(segments.entityFeeds).toHaveBeenCalledWith("t1");
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.feeds).toBeDefined();
    expect(result.contextStatus).toBe("active");
  });

  it("create passes the session user id (never a body-supplied one)", async () => {
    const { controller, segments } = setup();
    const dto = Object.assign(new CreateSegmentDto(), { name: "x", filter: FILTER });
    await controller.create("t1", dto, { user: { id: "u1" } } as never);
    expect(segments.create).toHaveBeenCalledWith("t1", "u1", dto);
    await controller.create("t1", dto, {} as never);
    expect(segments.create).toHaveBeenLastCalledWith("t1", null, dto);
  });

  it("CRUD routes delegate tenant-scoped", async () => {
    const { controller, segments } = setup();
    await controller.list("t1");
    await controller.get("t1", "seg1");
    await controller.update("t1", "seg1", Object.assign(new UpdateSegmentDto(), { name: "y" }));
    await controller.archive("t1", "seg1");
    await controller.restore("t1", "seg1");
    await controller.evaluate("t1", "seg1");
    expect(segments.list).toHaveBeenCalledWith("t1");
    expect(segments.get).toHaveBeenCalledWith("t1", "seg1");
    expect(segments.update).toHaveBeenCalledWith("t1", "seg1", expect.objectContaining({ name: "y" }));
    expect(segments.archive).toHaveBeenCalledWith("t1", "seg1");
    expect(segments.restore).toHaveBeenCalledWith("t1", "seg1");
    expect(segments.evaluate).toHaveBeenCalledWith("t1", "seg1");
  });

  it("preview validates the spec before touching the preview service", async () => {
    const { controller, preview } = setup();

    const good = Object.assign(new PreviewSegmentDto(), {
      filter: FILTER,
      policy: DEFAULT_SEGMENT_POLICY,
      seed: "s1",
      channel: "SMS",
    });
    await controller.previewSpec("t1", good);
    expect(preview.preview).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ seed: "s1", channel: "SMS" }),
    );

    // invalid policy
    await expect(
      controller.previewSpec("t1", Object.assign(new PreviewSegmentDto(), { filter: FILTER, policy: { junk: 1 } })),
    ).rejects.toThrow(BadRequestException);

    // L3 smuggled into the authored filter
    await expect(
      controller.previewSpec(
        "t1",
        Object.assign(new PreviewSegmentDto(), {
          filter: {
            kind: "all",
            children: [
              { kind: "condition", condition: { type: "compliance.reachable", channel: "SMS" } },
            ],
          },
        }),
      ),
    ).rejects.toThrow(BadRequestException);

    // dangling custom clause ref
    await expect(
      controller.previewSpec(
        "t1",
        Object.assign(new PreviewSegmentDto(), {
          filter: {
            kind: "all",
            children: [{ kind: "condition", condition: { type: "custom.clause", clauseRef: "x" } }],
          },
          customClauses: [],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("generate + custom-query compile delegate", async () => {
    const { controller, authoring, customQuery } = setup();
    await controller.generate(Object.assign(new GenerateSegmentDto(), { prompt: "reef people" }));
    expect(authoring.generateFromPrompt).toHaveBeenCalledWith("reef people");
    await controller.compileCustomQuery(
      "t1",
      Object.assign(new CompileCustomClauseDto(), { intent: "donors" }),
    );
    expect(customQuery.compileCustomClause).toHaveBeenCalledWith("t1", "donors");
  });
});
