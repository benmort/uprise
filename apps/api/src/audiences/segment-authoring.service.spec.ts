import { validateAuthoredFilter } from "@uprise/segmentation";

const createMock = jest.fn();
jest.mock("@anthropic-ai/sdk", () => {
  return jest.fn().mockImplementation(() => ({ messages: { create: createMock } }));
});

import { SegmentAuthoringService } from "./segment-authoring.service";

const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as never;

describe("SegmentAuthoringService — prompt-to-segment", () => {
  beforeEach(() => {
    delete process.env.SEGMENT_AI_ENABLED;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("keyword fallback (AI off): builds a valid, catalogue-snapped tree from a prompt", async () => {
    const svc = new SegmentAuthoringService(logger);
    const result = await svc.generateFromPrompt(
      "Active climate supporters in NSW and Queensland this month",
    );
    expect(validateAuthoredFilter(result.tree)).toEqual({ ok: true });
    const json = JSON.stringify(result.tree);
    expect(json).toContain("contact.state");
    expect(json).toContain('"NSW"');
    expect(json).toContain('"QLD"');
    expect(json).toContain("activity.lastActiveWithin");
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.name).toContain("Active climate supporters");
  });

  it("an unmatchable prompt yields the safe empty tree (everyone), never junk", async () => {
    const svc = new SegmentAuthoringService(logger);
    const result = await svc.generateFromPrompt("xyzzy plugh quux");
    expect(result.tree).toEqual({ kind: "all", children: [] });
    expect(validateAuthoredFilter(result.tree)).toEqual({ ok: true });
  });

  it("derives a trimmed, capitalised name from the prompt", async () => {
    const svc = new SegmentAuthoringService(logger);
    const long = "a".repeat(100);
    const result = await svc.generateFromPrompt(long);
    expect(result.name.length).toBeLessThanOrEqual(60);
  });

  describe("with the AI lane enabled (mocked Claude)", () => {
    beforeEach(() => {
      process.env.SEGMENT_AI_ENABLED = "true";
      process.env.ANTHROPIC_API_KEY = "test-key";
      createMock.mockReset();
    });

    it("snaps forced-tool-use output through the trust boundary; residual intent surfaces as custom clauses", async () => {
      createMock.mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            name: "build_segment",
            input: {
              filters: [
                { field: "contact.state", op: "in", value: ["NSW"] },
                { field: "made.up.field", op: "eq", value: "x", intent: "unexpressible thing" },
              ],
              customClauses: [{ label: "Big donors", intent: "gave over $500 lifetime" }],
            },
          },
        ],
      });
      const svc = new SegmentAuthoringService(logger);
      const result = await svc.generateFromPrompt("NSW big donors");

      expect(validateAuthoredFilter(result.tree)).toEqual({ ok: true });
      expect(JSON.stringify(result.tree)).toContain('"NSW"');
      expect(JSON.stringify(result.tree)).not.toContain("made.up.field");
      // Both the model's declared residual AND the unsnappable filter surface.
      expect(result.customClauses).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: "Big donors" }),
          expect.objectContaining({ label: "made.up.field" }),
        ]),
      );
    });

    it("falls back to the keyword matcher when the model call fails", async () => {
      createMock.mockRejectedValueOnce(new Error("api down"));
      const svc = new SegmentAuthoringService(logger);
      const result = await svc.generateFromPrompt("supporters in NSW");
      expect(validateAuthoredFilter(result.tree)).toEqual({ ok: true });
      expect(JSON.stringify(result.tree)).toContain('"NSW"');
    });
  });
});
