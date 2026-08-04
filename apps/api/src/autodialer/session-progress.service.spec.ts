import { SessionProgressService } from "./session-progress.service";

describe("SessionProgressService", () => {
  function setup() {
    const prisma = { dialerSessionEvent: { create: jest.fn().mockResolvedValue({ id: "ev1" }) } };
    const service = new SessionProgressService(prisma as never);
    return { prisma, service };
  }

  it("writes one DialerSessionEvent row per publish", async () => {
    const { prisma, service } = setup();
    await service.publish("sess1", "t1", "call_connected", { leg: "caller" });
    expect(prisma.dialerSessionEvent.create).toHaveBeenCalledWith({
      data: { tenantId: "t1", sessionId: "sess1", name: "call_connected", payload: { leg: "caller" } },
    });
  });

  it("no-ops on null/undefined sessionId — plain phone legs have no widget", async () => {
    const { prisma, service } = setup();
    await service.publish(null, "t1", "call_connected");
    await service.publish(undefined, "t1", "call_ended");
    expect(prisma.dialerSessionEvent.create).not.toHaveBeenCalled();
  });

  it("omits the payload column when none is given", async () => {
    const { prisma, service } = setup();
    await service.publish("sess1", "t1", "call_started");
    expect(prisma.dialerSessionEvent.create).toHaveBeenCalledWith({
      data: { tenantId: "t1", sessionId: "sess1", name: "call_started", payload: undefined },
    });
  });
});
