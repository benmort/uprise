import { Prisma } from "@yarns/db";
import type { EventEnvelope, Reaction } from "@yarns/events";
import { ReactionRegistry } from "./reaction-registry";

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "6.19.3" });
}

function envelope(eventType: string, id = "evt1"): EventEnvelope {
  return {
    id,
    eventType,
    tenantId: "t1",
    aggregateId: "a1",
    payload: {},
    metadata: {},
    occurredAt: "2026-06-22T00:00:00.000Z",
  };
}

function makeRegistry(reactions: Reaction[], prismaOverride?: unknown) {
  const prisma = (prismaOverride ?? { reactionDedup: { create: jest.fn() } }) as any;
  const logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn(), debug: jest.fn() } as any;
  const reg = new ReactionRegistry(reactions, prisma, logger);
  reg.onModuleInit();
  return { reg, prisma, logger };
}

describe("ReactionRegistry", () => {
  it("dispatches an event to its reaction and claims dedup once", async () => {
    const handle = jest.fn().mockResolvedValue(undefined);
    const { reg, prisma } = makeRegistry([{ trigger: "audience.imported", handle }]);
    await reg.dispatch("domain-events", envelope("audience.imported"));
    expect(prisma.reactionDedup.create).toHaveBeenCalledWith({
      data: { source: "domain-events", eventId: "evt1" },
    });
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("ignores events with no registered reaction (no dedup claim)", async () => {
    const { reg, prisma } = makeRegistry([{ trigger: "audience.imported", handle: jest.fn() }]);
    await reg.dispatch("domain-events", envelope("payment.payment.succeeded"));
    expect(prisma.reactionDedup.create).not.toHaveBeenCalled();
  });

  it("skips a duplicate delivery when the dedup claim hits P2002", async () => {
    const handle = jest.fn();
    const { reg } = makeRegistry([{ trigger: "audience.imported", handle }], {
      reactionDedup: { create: jest.fn().mockRejectedValue(p2002()) },
    });
    await reg.dispatch("domain-events", envelope("audience.imported"));
    expect(handle).not.toHaveBeenCalled();
  });

  it("catches a reaction failure (does not throw; logs it)", async () => {
    const handle = jest.fn().mockRejectedValue(new Error("boom"));
    const { reg, logger } = makeRegistry([{ trigger: "audience.imported", handle }]);
    await expect(reg.dispatch("domain-events", envelope("audience.imported"))).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it("runs every reaction registered for the trigger", async () => {
    const a = jest.fn().mockResolvedValue(undefined);
    const b = jest.fn().mockResolvedValue(undefined);
    const { reg } = makeRegistry([
      { trigger: "audience.imported", handle: a },
      { trigger: "audience.imported", handle: b },
    ]);
    await reg.dispatch("domain-events", envelope("audience.imported"));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("fails fast on a loop-unsafe reaction (emits its own trigger)", () => {
    const reg = new ReactionRegistry(
      [{ trigger: "audience.imported", emits: ["audience.imported"], handle: jest.fn() }],
      { reactionDedup: { create: jest.fn() } } as any,
      { error: jest.fn() } as any,
    );
    expect(() => reg.onModuleInit()).toThrow(/loop-unsafe/i);
  });
});
