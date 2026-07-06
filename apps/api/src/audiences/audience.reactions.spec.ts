import { assertReactionsLoopSafe, type EventEnvelope } from "@uprise/events";
import { buildAudienceReactions } from "./audience.reactions";

function setup() {
  const audiences = {
    ensureImportSegment: jest.fn().mockResolvedValue({ segmentId: "seg1", created: true }),
  };
  const logger = { warn: jest.fn(), log: jest.fn(), debug: jest.fn(), error: jest.fn() };
  const reactions = buildAudienceReactions({ audiences: audiences as any, logger: logger as any });
  return { audiences, logger, reactions };
}

const envelope = (payload: unknown): EventEnvelope =>
  ({ eventType: "audience.imported", aggregateId: "aud1", payload }) as unknown as EventEnvelope;

describe("buildAudienceReactions", () => {
  it("registers exactly one loop-safe audience.imported reaction", () => {
    const { reactions } = setup();
    expect(reactions).toHaveLength(1);
    expect(reactions[0].trigger).toBe("audience.imported");
    expect(reactions[0].emits).toEqual(["audience.segment.recomputed"]);
    expect(() => assertReactionsLoopSafe(reactions)).not.toThrow();
  });

  it("materialises the import segment for a well-formed event", async () => {
    const { reactions, audiences } = setup();
    await reactions[0].handle(envelope({ audienceId: "aud1", tenantId: "org1", count: 5 }));
    expect(audiences.ensureImportSegment).toHaveBeenCalledWith("org1", "aud1");
  });

  it("no-ops (and warns) when the payload is missing ids", async () => {
    const { reactions, audiences, logger } = setup();
    await reactions[0].handle(envelope({ count: 1 }));
    expect(audiences.ensureImportSegment).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
