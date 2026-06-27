import { CallStatus } from "@uprise/db";
import { CallsService } from "./calls.service";

function setup(callRow?: any) {
  const prisma: any = {
    tenant: { upsert: jest.fn(async () => ({ id: "t1", slug: "default" })) },
    call: {
      create: jest.fn(async ({ data }: any) => ({ id: "call1", ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: "call1", ...data })),
      findUnique: jest.fn(async () => callRow ?? null),
      findFirst: jest.fn(async () => callRow ?? null),
      findMany: jest.fn(async () => []),
    },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const config = { get: jest.fn((_k: string, fb?: string) => fb ?? "") } as any;
  const outbox = { append: jest.fn() } as any;
  const webhookEvents = { claim: jest.fn(async () => true), release: jest.fn() } as any;
  const twilio = { placeCall: jest.fn(async () => ({ sid: "CA_live", status: "queued" })) } as any;
  const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), log: jest.fn() } as any;
  const svc = new CallsService(prisma, config, outbox, webhookEvents, twilio, logger);
  return { svc, prisma, outbox, webhookEvents, twilio };
}

describe("CallsService", () => {
  describe("initiate", () => {
    it("writes INITIATED + outbox atomically, dispatches, and binds the provider CallSid", async () => {
      const { svc, prisma, outbox, twilio } = setup();
      await svc.initiate({ toNumber: "+61400000001", url: "https://x/twiml" });

      expect(prisma.call.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: CallStatus.INITIATED, toNumber: "+61400000001" }) }),
      );
      expect(outbox.append).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "telephony.call.initiated", aggregateId: "call1" }),
      );
      expect(twilio.placeCall).toHaveBeenCalledWith(
        expect.objectContaining({ to: "+61400000001", url: "https://x/twiml" }),
      );
      expect(prisma.call.update).toHaveBeenCalledWith({ where: { id: "call1" }, data: { providerCallId: "CA_live" } });
    });

    it("rejects a non-E.164 toNumber", async () => {
      const { svc } = setup();
      await expect(svc.initiate({ toNumber: "0400 000 001" })).rejects.toThrow();
    });

    it("marks the call FAILED and rethrows when dispatch fails", async () => {
      const { svc, prisma, twilio } = setup();
      twilio.placeCall.mockRejectedValueOnce(new Error("twilio down"));
      await expect(svc.initiate({ toNumber: "+61400000001", url: "https://x/twiml" })).rejects.toThrow("twilio down");
      expect(prisma.call.update).toHaveBeenCalledWith({ where: { id: "call1" }, data: { status: CallStatus.FAILED } });
    });
  });

  describe("processStatusCallback", () => {
    it("skips a duplicate status delivery (claim=false)", async () => {
      const { svc, prisma, webhookEvents } = setup();
      webhookEvents.claim.mockResolvedValueOnce(false);
      await svc.processStatusCallback({ callSid: "CA1", status: "completed" });
      expect(prisma.call.findUnique).not.toHaveBeenCalled();
    });

    it("claims per (callSid:status) so distinct statuses each apply", async () => {
      const { svc, webhookEvents } = setup({ id: "call1", status: CallStatus.INITIATED, providerCallId: "CA1" });
      await svc.processStatusCallback({ callSid: "CA1", status: "ringing" });
      expect(webhookEvents.claim).toHaveBeenCalledWith("twilio-voice", "CA1:ringing");
    });

    it("transitions to IN_PROGRESS binding startedAt", async () => {
      const startedAt = new Date("2026-06-22T00:00:00Z");
      const { svc, prisma } = setup({ id: "call1", status: CallStatus.RINGING, providerCallId: "CA1" });
      await svc.processStatusCallback({ callSid: "CA1", status: "in-progress", startedAt });
      expect(prisma.call.update).toHaveBeenCalledWith({
        where: { id: "call1" },
        data: { status: CallStatus.IN_PROGRESS, startedAt },
      });
    });

    it("binds duration/recording/price/currency on completed", async () => {
      const { svc, prisma } = setup({ id: "call1", status: CallStatus.IN_PROGRESS, providerCallId: "CA1" });
      await svc.processStatusCallback({
        callSid: "CA1",
        status: "completed",
        durationSeconds: 42,
        recordingUrl: "https://rec/1",
        priceCents: 2,
        currency: "USD",
      });
      const data = prisma.call.update.mock.calls[0][0].data;
      expect(data).toEqual(
        expect.objectContaining({
          status: CallStatus.COMPLETED,
          durationSeconds: 42,
          recordingUrl: "https://rec/1",
          priceCents: 2,
          currency: "USD",
        }),
      );
      expect(data.endedAt).toBeInstanceOf(Date);
    });

    it("is an idempotent no-op on a replayed terminal transition", async () => {
      const { svc, prisma } = setup({ id: "call1", status: CallStatus.COMPLETED, providerCallId: "CA1" });
      await svc.processStatusCallback({ callSid: "CA1", status: "completed" });
      expect(prisma.call.update).not.toHaveBeenCalled();
    });

    it("ignores a non-transitional status (queued)", async () => {
      const { svc, prisma } = setup({ id: "call1", status: CallStatus.INITIATED, providerCallId: "CA1" });
      await svc.processStatusCallback({ callSid: "CA1", status: "queued" });
      expect(prisma.call.findUnique).not.toHaveBeenCalled();
      expect(prisma.call.update).not.toHaveBeenCalled();
    });

    it("is a no-op for an unknown call (no row)", async () => {
      const { svc, prisma } = setup(null);
      await svc.processStatusCallback({ callSid: "CA_unknown", status: "completed" });
      expect(prisma.call.update).not.toHaveBeenCalled();
    });

    it("releases the claim and rethrows when the update throws", async () => {
      const { svc, prisma, webhookEvents } = setup({ id: "call1", status: CallStatus.RINGING, providerCallId: "CA1" });
      prisma.call.update.mockRejectedValueOnce(new Error("db down"));
      await expect(svc.processStatusCallback({ callSid: "CA1", status: "completed" })).rejects.toThrow("db down");
      expect(webhookEvents.release).toHaveBeenCalledWith("twilio-voice", "CA1:completed");
    });
  });
});
