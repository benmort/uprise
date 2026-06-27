import { BlastRecipientStatus, TxSmsStatus } from "@uprise/db";
import { ConfigService } from "@nestjs/config";
import { BlastsService } from "./blasts.service";
import { TemplateRendererService } from "./template-renderer.service";
import { ComplianceService } from "./compliance.service";
import { TwilioService } from "../twilio/twilio.service";
import { RealtimeEventsService } from "../common/events/realtime-events.service";
import { ConsentService } from "../messaging/consent.service";

/**
 * M2 (doc 09/12): the Twilio SMS status callback must (a) claim-once for
 * idempotency, (b) advance transactional rows on txStatus via the SMS FSM, and
 * (c) distinguish a carrier 'undelivered' from a hard 'failed' on recipients.
 */
describe("BlastsService — Twilio SMS callback (claim + txStatus + undelivered)", () => {
  const configMock = { get: (_: string, d?: string) => d ?? "default" } as ConfigService;
  const eventsMock = { emit: jest.fn() } as unknown as RealtimeEventsService;
  const consentMock = {
    getStatesForPhones: jest.fn().mockResolvedValue(new Map()),
    canSend: jest.fn().mockReturnValue(true),
  } as unknown as ConsentService;

  function build(prismaMock: any, webhookEvents: any) {
    return new BlastsService(
      prismaMock,
      configMock,
      new TemplateRendererService(),
      new ComplianceService(configMock),
      { sendMessage: jest.fn() } as unknown as TwilioService,
      eventsMock,
      consentMock,
      undefined,
      undefined,
      webhookEvents,
      { append: jest.fn().mockResolvedValue(undefined) } as any,
    );
  }

  it("drops a replayed callback that fails the idempotency claim", async () => {
    const prismaMock: any = {
      blastRecipient: { findMany: jest.fn() },
      outboundMessage: { findMany: jest.fn() },
    };
    const webhookEvents = { claim: jest.fn().mockResolvedValue(false), release: jest.fn() };
    const service = build(prismaMock, webhookEvents);

    const result = await service.handleTwilioStatusCallback({
      messageSid: "SMdup",
      messageStatus: "delivered",
    });

    expect(result).toEqual(expect.objectContaining({ ignored: true }));
    expect(webhookEvents.claim).toHaveBeenCalledWith("twilio", "SMdup:delivered");
    expect(prismaMock.blastRecipient.findMany).not.toHaveBeenCalled();
  });

  it("advances a transactional row's txStatus to DELIVERED", async () => {
    const prismaMock: any = {
      $transaction: (cb: any) => cb(prismaMock),
      blastRecipient: { findMany: jest.fn().mockResolvedValue([]) },
      outboundMessage: {
        findMany: jest.fn().mockResolvedValue([
          { id: "o1", kind: "TRANSACTIONAL", status: "SENT", txStatus: "SENT", errorCode: null, errorMessage: null },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const webhookEvents = { claim: jest.fn().mockResolvedValue(true), release: jest.fn() };
    const service = build(prismaMock, webhookEvents);

    const result = await service.handleTwilioStatusCallback({
      messageSid: "SMtx",
      messageStatus: "delivered",
    });

    expect(prismaMock.outboundMessage.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { txStatus: TxSmsStatus.DELIVERED },
    });
    expect(result).toEqual(expect.objectContaining({ outboundUpdates: 1 }));
  });

  it("maps a transactional 'undelivered' to txStatus UNDELIVERED with the error", async () => {
    const prismaMock: any = {
      $transaction: (cb: any) => cb(prismaMock),
      blastRecipient: { findMany: jest.fn().mockResolvedValue([]) },
      outboundMessage: {
        findMany: jest.fn().mockResolvedValue([
          { id: "o2", kind: "TRANSACTIONAL", status: "SENT", txStatus: "SENT", errorCode: null, errorMessage: null },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const webhookEvents = { claim: jest.fn().mockResolvedValue(true), release: jest.fn() };
    const service = build(prismaMock, webhookEvents);

    await service.handleTwilioStatusCallback({
      messageSid: "SMtx2",
      messageStatus: "undelivered",
      errorCode: "30005",
      errorMessage: "Unknown destination handset",
    });

    expect(prismaMock.outboundMessage.update).toHaveBeenCalledWith({
      where: { id: "o2" },
      data: expect.objectContaining({
        txStatus: TxSmsStatus.UNDELIVERED,
        errorCode: "30005",
      }),
    });
  });

  it("marks a marketing recipient UNDELIVERED (not FAILED) on a carrier 'undelivered'", async () => {
    const prismaMock: any = {
      $transaction: (cb: any) => cb(prismaMock),
      blast: {
        findUnique: jest.fn().mockResolvedValue({
          id: "b1",
          tenantId: "org1",
          status: BlastStatusSending(),
          completedAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      blastRecipient: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "r1",
              blastId: "b1",
              status: BlastRecipientStatus.SENT,
              deliveredAt: null,
              failureCategory: null,
              errorCode: null,
              errorMessage: null,
              metadata: {},
            },
          ])
          .mockResolvedValueOnce([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
      },
      outboundMessage: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const webhookEvents = { claim: jest.fn().mockResolvedValue(true), release: jest.fn() };
    const service = build(prismaMock, webhookEvents);

    await service.handleTwilioStatusCallback({
      messageSid: "SMm",
      messageStatus: "undelivered",
      errorCode: "30003",
      errorMessage: "Unreachable destination handset",
    });

    expect(prismaMock.blastRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({ status: BlastRecipientStatus.UNDELIVERED }),
      }),
    );
  });
});

// BlastStatus.SENDING without importing the enum twice (avoids an unused import lint).
function BlastStatusSending(): string {
  return "SENDING";
}
