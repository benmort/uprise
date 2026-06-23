import { PrismaClient } from "@yarns/db";
import type { EventEnvelope, Reaction } from "@yarns/events";
import { ReactionRegistry } from "./reaction-registry";
import type { PrismaService } from "../../prisma/prisma.service";

/**
 * Real-DB integration (meld doc 05 follow-up): proves the events.ReactionDedup
 * unique index actually enforces at-most-once dispatch — the unit spec fakes the
 * P2002, this exercises the live constraint. Self-skips when no DB is reachable
 * (the BullMQ relay→consumer publish leg remains for the live-stack e2e).
 */
describe("ReactionRegistry — real-DB dedup (integration)", () => {
  let prisma: PrismaClient;
  let dbUp = false;
  const logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn(), debug: jest.fn() } as never;
  const SOURCE = "integration-test";

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbUp = true;
    } catch {
      dbUp = false;
    }
  });

  afterAll(async () => {
    if (dbUp) {
      await prisma.reactionDedup.deleteMany({ where: { source: SOURCE } }).catch(() => undefined);
    }
    await prisma?.$disconnect().catch(() => undefined);
  });

  function envelope(id: string): EventEnvelope {
    return {
      id,
      eventType: "audience.imported",
      tenantId: "t1",
      aggregateId: "a1",
      payload: {},
      metadata: {},
      occurredAt: "2026-06-23T00:00:00.000Z",
    };
  }

  it("fires a reaction exactly once across a real duplicate delivery", async () => {
    if (!dbUp) return; // no DB in this environment — covered by the live-stack e2e
    const eventId = `it-${Date.now()}`;
    await prisma.reactionDedup.deleteMany({ where: { source: SOURCE, eventId } });

    const handle = jest.fn().mockResolvedValue(undefined);
    const reaction: Reaction = { trigger: "audience.imported", handle };
    const reg = new ReactionRegistry([reaction], prisma as unknown as PrismaService, logger);
    reg.onModuleInit();

    await reg.dispatch(SOURCE, envelope(eventId));
    await reg.dispatch(SOURCE, envelope(eventId)); // replayed delivery
    expect(handle).toHaveBeenCalledTimes(1);

    // The unique (source, eventId) genuinely blocks a second claim insert.
    await expect(
      prisma.reactionDedup.create({ data: { source: SOURCE, eventId } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
