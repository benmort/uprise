import { OutboxService } from "./outbox.service";

describe("OutboxService", () => {
  it("appends an outbox event on the given transaction client", async () => {
    const tx = { outboxEvent: { create: jest.fn() } } as any;
    await new OutboxService().append(tx, {
      tenantId: "t1",
      eventType: "audience.imported",
      aggregateId: "a1",
      payload: { audienceId: "a1", tenantId: "t1", count: 5 },
      metadata: { actorId: "u1" },
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        tenantId: "t1",
        eventType: "audience.imported",
        aggregateId: "a1",
        payload: { audienceId: "a1", tenantId: "t1", count: 5 },
        metadata: { actorId: "u1" },
      },
    });
  });

  it("defaults metadata to {} when omitted", async () => {
    const tx = { outboxEvent: { create: jest.fn() } } as any;
    await new OutboxService().append(tx, {
      tenantId: "t1",
      eventType: "messaging.blast.sent",
      aggregateId: "b1",
      payload: { blastId: "b1", tenantId: "t1", recipientCount: 3 },
    });
    expect(tx.outboxEvent.create.mock.calls[0][0].data.metadata).toEqual({});
  });
});
