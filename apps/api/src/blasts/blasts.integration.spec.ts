import { ConfigService } from "@nestjs/config";
import { BlastRecipientStatus, BlastStatus } from "@yarns/db";
import { BlastsService } from "./blasts.service";
import { TemplateRendererService } from "./template-renderer.service";
import { ComplianceService } from "./compliance.service";
import { TwilioService } from "../twilio/twilio.service";
import { RealtimeEventsService } from "../common/events/realtime-events.service";
import { ConsentService } from "../messaging/consent.service";

describe("BlastsService integration-like flow", () => {
  const configMock = {
    get: (_: string, fallback?: string) => fallback ?? "default",
  } as ConfigService;

  const eventsMock = {
    emit: jest.fn(),
  } as unknown as RealtimeEventsService;

  const consentMock = {
    getStatesForPhones: jest.fn().mockResolvedValue(new Map()),
    canSend: jest.fn().mockReturnValue(true),
  } as unknown as ConsentService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("treats markProofed as idempotent when blast is already proofed", async () => {
    const alreadyProofedAt = new Date("2026-05-19T10:30:00.000Z");
    const prismaMock: any = {
      blast: {
        findUnique: jest.fn().mockResolvedValue({
          id: "blast_proofed",
          status: BlastStatus.PROOFED,
          proofedAt: alreadyProofedAt,
        }),
        update: jest.fn(),
      },
    };

    const service = new BlastsService(
      prismaMock,
      configMock,
      new TemplateRendererService(),
      new ComplianceService(configMock),
      { sendMessage: jest.fn() } as unknown as TwilioService,
      eventsMock,
      consentMock,
    );

    const result = await service.markProofed("blast_proofed");
    expect(result.status).toBe(BlastStatus.PROOFED);
    expect(result.proofedAt).toEqual(alreadyProofedAt);
    expect(prismaMock.blast.update).not.toHaveBeenCalled();
  });

  it("creates and sends one recipient when audience includes duplicate phones", async () => {
    const prismaMock: any = {
      tenant: {
        upsert: jest.fn().mockResolvedValue({ id: "org_1", slug: "default" }),
      },
      blast: {
        create: jest.fn().mockResolvedValue({
          id: "blast_1",
          tenantId: "org_1",
          audienceId: "aud_1",
          bodyTemplate: "Hi {{first_name}}",
          status: "DRAFTED",
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: "blast_1",
          tenantId: "org_1",
          audienceId: "aud_1",
          bodyTemplate: "Hi {{first_name}}",
          status: "PROOFED",
        }),
        update: jest.fn().mockImplementation(async ({ data }: { data: { status: string } }) => ({
          id: "blast_1",
          tenantId: "org_1",
          audienceId: "aud_1",
          status: data.status,
          startedAt: new Date(),
          completedAt: new Date(),
          bodyTemplate: "Hi {{first_name}}",
          title: "Campaign",
          proofedAt: new Date(),
        })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      blastTemplate: {
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(1),
      },
      audience: { findFirst: jest.fn().mockResolvedValue(null) },
      audienceSegment: { findMany: jest.fn().mockResolvedValue([]) },
      audienceContact: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "contact_1",
            phoneE164: "+15551234567",
            metadata: { first_name: "Alice" },
          },
          {
            id: "contact_2",
            phoneE164: "+15551234567",
            metadata: { first_name: "Alice Duplicate" },
          },
        ]),
      },
      blastRecipient: {
        create: jest.fn().mockResolvedValue({ id: "recipient_1" }),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "recipient_1",
              phoneE164: "+15551234567",
              renderedBody: "Hi Alice",
            },
          ])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
        count: jest
          .fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0),
      },
      outboundMessage: {
        create: jest.fn().mockResolvedValue({}),
      },
      analyticsSnapshot: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const twilioMock = {
      sendMessage: jest.fn().mockResolvedValue({
        sid: "SM123",
        to: "+15551234567",
        from: "+15550000000",
        body: "Hi Alice",
        dateCreated: new Date().toISOString(),
        dateSent: new Date().toISOString(),
      }),
    } as unknown as TwilioService;

    const service = new BlastsService(
      prismaMock,
      configMock,
      new TemplateRendererService(),
      new ComplianceService(configMock),
      twilioMock,
      eventsMock,
      consentMock,
    );

    const created = await service.createDraft({
      title: "Campaign",
      audienceId: "aud_1",
      bodyTemplate: "Hi {{first_name}}",
    });
    expect(created.id).toBe("blast_1");

    const sent = await service.sendNow("blast_1");
    expect(sent.sent).toBe(1);
    expect(sent.skipped).toBe(0);
    expect(prismaMock.blastRecipient.create).toHaveBeenCalledTimes(1);
    expect(twilioMock.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("skips duplicate pending recipients once a phone was already sent", async () => {
    const prismaMock: any = {
      tenant: {
        upsert: jest.fn().mockResolvedValue({ id: "org_1", slug: "default" }),
      },
      blast: {
        findUnique: jest.fn().mockResolvedValue({
          id: "blast_1",
          tenantId: "org_1",
          audienceId: "aud_1",
          bodyTemplate: "Hi {{first_name}}",
          title: "Campaign",
          status: "PROOFED",
          proofedAt: new Date(),
          startedAt: null,
          completedAt: null,
        }),
        update: jest.fn().mockImplementation(async ({ data }: { data: { status: string } }) => ({
          id: "blast_1",
          tenantId: "org_1",
          audienceId: "aud_1",
          status: data.status,
          startedAt: new Date(),
          completedAt: new Date(),
          bodyTemplate: "Hi {{first_name}}",
          title: "Campaign",
          proofedAt: new Date(),
        })),
      },
      blastRecipient: {
        count: jest
          .fn()
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "recipient_duplicate",
              phoneE164: "+15551234567",
              renderedBody: "Hi Alice",
            },
          ])
          .mockResolvedValueOnce([{ phoneE164: "+15551234567" }])
          .mockResolvedValueOnce([]),
        update: jest.fn().mockResolvedValue({}),
      },
      outboundMessage: {
        create: jest.fn().mockResolvedValue({}),
      },
      analyticsSnapshot: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const twilioMock = {
      sendMessage: jest.fn(),
    } as unknown as TwilioService;

    const service = new BlastsService(
      prismaMock,
      configMock,
      new TemplateRendererService(),
      new ComplianceService(configMock),
      twilioMock,
      eventsMock,
      consentMock,
    );

    const sent = await service.sendNow("blast_1");

    expect(sent.sent).toBe(0);
    expect(sent.skipped).toBe(1);
    expect(twilioMock.sendMessage).not.toHaveBeenCalled();
    expect(prismaMock.blastRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "recipient_duplicate" },
        data: expect.objectContaining({
          status: "SKIPPED",
          failureCategory: "EXTERNAL_DUPLICATE_RECIPIENT",
          errorMessage: "Skipped duplicate recipient: message already sent for this blast.",
        }),
      }),
    );
  });

  it("marks delivered from callback and preserves responded recipient status", async () => {
    const prismaMock: any = {
      blast: {
        findUnique: jest.fn().mockResolvedValue({
          id: "blast_1",
          status: BlastStatus.SENT,
          completedAt: new Date("2026-05-13T10:00:00.000Z"),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      blastRecipient: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "recipient_sent",
              blastId: "blast_1",
              status: BlastRecipientStatus.SENT,
              deliveredAt: null,
              errorCode: null,
              errorMessage: null,
            },
            {
              id: "recipient_responded",
              blastId: "blast_1",
              status: BlastRecipientStatus.RESPONDED,
              deliveredAt: null,
              errorCode: null,
              errorMessage: null,
            },
          ])
          .mockResolvedValueOnce([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
      },
      outboundMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "outbound_1",
            status: BlastRecipientStatus.SENT,
            errorCode: null,
            errorMessage: null,
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new BlastsService(
      prismaMock,
      configMock,
      new TemplateRendererService(),
      new ComplianceService(configMock),
      { sendMessage: jest.fn() } as unknown as TwilioService,
      eventsMock,
      consentMock,
    );

    const result = await service.handleTwilioStatusCallback({
      messageSid: "SM_DELIVERED_1",
      messageStatus: "delivered",
    });

    expect(result).toEqual(
      expect.objectContaining({
        messageSid: "SM_DELIVERED_1",
        status: "delivered",
        recipientUpdates: 2,
        outboundUpdates: 1,
      }),
    );
    expect(prismaMock.blastRecipient.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "recipient_sent" },
        data: expect.objectContaining({
          status: BlastRecipientStatus.DELIVERED,
          deliveredAt: expect.any(Date),
          metadata: expect.any(Object),
        }),
      }),
    );
    expect(prismaMock.blastRecipient.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: "recipient_responded" },
        data: expect.objectContaining({
          deliveredAt: expect.any(Date),
          metadata: expect.any(Object),
        }),
      }),
    );
    expect(prismaMock.outboundMessage.update).toHaveBeenCalledWith({
      where: { id: "outbound_1" },
      data: {
        status: BlastRecipientStatus.DELIVERED,
      },
    });
  });

  it("treats duplicate delivered callbacks as idempotent updates", async () => {
    const firstDeliveredAt = new Date("2026-05-11T09:30:00.000Z");
    const prismaMock: any = {
      blastRecipient: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "recipient_delivered",
            status: BlastRecipientStatus.DELIVERED,
            deliveredAt: firstDeliveredAt,
            errorCode: null,
            errorMessage: null,
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      outboundMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "outbound_delivered",
            status: BlastRecipientStatus.DELIVERED,
            errorCode: null,
            errorMessage: null,
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new BlastsService(
      prismaMock,
      configMock,
      new TemplateRendererService(),
      new ComplianceService(configMock),
      { sendMessage: jest.fn() } as unknown as TwilioService,
      eventsMock,
      consentMock,
    );

    const result = await service.handleTwilioStatusCallback({
      messageSid: "SM_DELIVERED_1",
      messageStatus: "delivered",
    });

    expect(result).toEqual(
      expect.objectContaining({
        recipientUpdates: 0,
        outboundUpdates: 0,
      }),
    );
    expect(prismaMock.blastRecipient.update).not.toHaveBeenCalled();
    expect(prismaMock.outboundMessage.update).not.toHaveBeenCalled();
  });

  it("keeps blast status SENT when only external failures exist", async () => {
    const prismaMock: any = {
      blast: {
        findUnique: jest.fn().mockResolvedValue({
          id: "blast_external",
          tenantId: "org_1",
          audienceId: "aud_1",
          bodyTemplate: "Hi {{first_name}}",
          title: "Campaign",
          status: BlastStatus.PROOFED,
          proofedAt: new Date(),
          startedAt: null,
          completedAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      blastRecipient: {
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "recipient_1",
              phoneE164: "+15551234567",
              renderedBody: "Hi Alice",
              metadata: {},
            },
          ])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              failureCategory: "EXTERNAL_CARRIER_OR_DESTINATION",
              errorCode: "30008",
              errorMessage: "Unknown destination handset",
            },
          ]),
        update: jest.fn().mockResolvedValue({}),
      },
      outboundMessage: {
        create: jest.fn().mockResolvedValue({}),
      },
      analyticsSnapshot: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const twilioMock = {
      sendMessage: jest.fn().mockRejectedValue(new Error("Twilio send failed: code 30008")),
    } as unknown as TwilioService;

    const service = new BlastsService(
      prismaMock,
      configMock,
      new TemplateRendererService(),
      new ComplianceService(configMock),
      twilioMock,
      eventsMock,
      consentMock,
    );

    await service.sendNow("blast_external");

    expect(prismaMock.blast.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "blast_external" },
        data: expect.objectContaining({ status: BlastStatus.SENT }),
      }),
    );
    expect(prismaMock.blast.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "blast_external" },
        data: expect.objectContaining({ status: BlastStatus.FAILED }),
      }),
    );
  });

  it("marks blast status FAILED when internal failures are present", async () => {
    const prismaMock: any = {
      blast: {
        findUnique: jest.fn().mockResolvedValue({
          id: "blast_internal",
          tenantId: "org_1",
          audienceId: "aud_1",
          bodyTemplate: "Hi {{first_name}}",
          title: "Campaign",
          status: BlastStatus.PROOFED,
          proofedAt: new Date(),
          startedAt: null,
          completedAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      blastRecipient: {
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "recipient_1",
              phoneE164: "+15551234567",
              renderedBody: "Hi Alice",
              metadata: {},
            },
          ])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              failureCategory: "INTERNAL_NETWORK",
              errorCode: null,
              errorMessage: "network timeout",
            },
          ]),
        update: jest.fn().mockResolvedValue({}),
      },
      outboundMessage: {
        create: jest.fn().mockResolvedValue({}),
      },
      analyticsSnapshot: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const twilioMock = {
      sendMessage: jest.fn().mockRejectedValue(new Error("network timeout while sending")),
    } as unknown as TwilioService;

    const service = new BlastsService(
      prismaMock,
      configMock,
      new TemplateRendererService(),
      new ComplianceService(configMock),
      twilioMock,
      eventsMock,
      consentMock,
    );

    await service.sendNow("blast_internal");

    expect(prismaMock.blast.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "blast_internal" },
        data: expect.objectContaining({ status: BlastStatus.FAILED }),
      }),
    );
  });

  it("treats unknown no-code failures as internal for blast status", async () => {
    const prismaMock: any = {
      blast: {
        findUnique: jest.fn().mockResolvedValue({
          id: "blast_unknown",
          tenantId: "org_1",
          audienceId: "aud_1",
          bodyTemplate: "Hi {{first_name}}",
          title: "Campaign",
          status: BlastStatus.PROOFED,
          proofedAt: new Date(),
          startedAt: null,
          completedAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      blastRecipient: {
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "recipient_1",
              phoneE164: "+15551234567",
              renderedBody: "Hi Alice",
              metadata: {},
            },
          ])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              failureCategory: null,
              errorCode: null,
              errorMessage: "unexpected upstream failure",
            },
          ]),
        update: jest.fn().mockResolvedValue({}),
      },
      outboundMessage: {
        create: jest.fn().mockResolvedValue({}),
      },
      analyticsSnapshot: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const twilioMock = {
      sendMessage: jest.fn().mockRejectedValue(new Error("unexpected upstream failure")),
    } as unknown as TwilioService;

    const service = new BlastsService(
      prismaMock,
      configMock,
      new TemplateRendererService(),
      new ComplianceService(configMock),
      twilioMock,
      eventsMock,
      consentMock,
    );

    await service.sendNow("blast_unknown");

    expect(prismaMock.blast.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "blast_unknown" },
        data: expect.objectContaining({ status: BlastStatus.FAILED }),
      }),
    );
  });

  it("recalculates blast status on callbacks using failure scope", async () => {
    const prismaMock: any = {
      blast: {
        findUnique: jest.fn().mockResolvedValue({
          id: "blast_callback",
          status: BlastStatus.SENDING,
          completedAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      blastRecipient: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "recipient_callback",
              blastId: "blast_callback",
              status: BlastRecipientStatus.SENT,
              deliveredAt: null,
              failureCategory: null,
              errorCode: null,
              errorMessage: null,
              metadata: {},
            },
          ])
          .mockResolvedValueOnce([
            {
              failureCategory: "EXTERNAL_CARRIER_OR_DESTINATION",
              errorCode: "30008",
              errorMessage: "Unknown destination handset",
            },
          ]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
      },
      outboundMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "outbound_callback",
            status: BlastRecipientStatus.SENT,
            errorCode: null,
            errorMessage: null,
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new BlastsService(
      prismaMock,
      configMock,
      new TemplateRendererService(),
      new ComplianceService(configMock),
      { sendMessage: jest.fn() } as unknown as TwilioService,
      eventsMock,
      consentMock,
    );

    const result = await service.handleTwilioStatusCallback({
      messageSid: "SM_FAILED_1",
      messageStatus: "failed",
      errorCode: "30008",
      errorMessage: "Unknown destination handset",
    });

    expect(prismaMock.blastRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "recipient_callback" },
        data: expect.objectContaining({
          status: BlastRecipientStatus.FAILED,
          failureCategory: "EXTERNAL_CARRIER_OR_DESTINATION",
          errorCode: "30008",
        }),
      }),
    );
    expect(prismaMock.blast.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "blast_callback" },
        data: expect.objectContaining({ status: BlastStatus.SENT }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        recipientUpdates: 1,
        outboundUpdates: 1,
      }),
    );
  });

  it("simulates sendNow delivery without calling Twilio when BLAST_DRY_RUN is enabled", async () => {
    const dryRunConfigMock = {
      get: (key: string, fallback?: unknown) => {
        if (key === "BLAST_DRY_RUN") return true;
        if (key === "TWILIO_PHONE_NUMBER") return "+15550000000";
        return fallback;
      },
    } as ConfigService;

    const prismaMock: any = {
      blast: {
        findUnique: jest.fn().mockResolvedValue({
          id: "blast_dry",
          tenantId: "org_1",
          audienceId: "aud_1",
          bodyTemplate: "Hi {{first_name}}",
          title: "Dry Run Campaign",
          status: BlastStatus.PROOFED,
          proofedAt: new Date(),
          startedAt: null,
          completedAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      blastRecipient: {
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "recipient_dry",
              phoneE164: "+15551234567",
              renderedBody: "Hi Alice",
              metadata: {},
            },
          ])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
        update: jest.fn().mockResolvedValue({}),
      },
      outboundMessage: {
        create: jest.fn().mockResolvedValue({}),
      },
      analyticsSnapshot: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const twilioMock = {
      sendMessage: jest.fn(),
    } as unknown as TwilioService;

    const service = new BlastsService(
      prismaMock,
      dryRunConfigMock,
      new TemplateRendererService(),
      new ComplianceService(dryRunConfigMock),
      twilioMock,
      eventsMock,
      consentMock,
    );

    const result = await service.sendNow("blast_dry");

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(twilioMock.sendMessage).not.toHaveBeenCalled();
    expect(prismaMock.outboundMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          twilioMessageSid: expect.stringMatching(/^DRYRUN-/),
        }),
      }),
    );
  });

  it("simulates retryFailed delivery without calling Twilio when BLAST_DRY_RUN is enabled", async () => {
    const dryRunConfigMock = {
      get: (key: string, fallback?: unknown) => {
        if (key === "BLAST_DRY_RUN") return true;
        if (key === "TWILIO_PHONE_NUMBER") return "+15550000000";
        return fallback;
      },
    } as ConfigService;

    const prismaMock: any = {
      blast: {
        findUnique: jest.fn().mockResolvedValue({
          id: "blast_retry_dry",
          status: BlastStatus.SENDING,
          completedAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      blastRecipient: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "recipient_retry_dry",
              blastId: "blast_retry_dry",
              status: BlastRecipientStatus.FAILED,
              phoneE164: "+15551234567",
              renderedBody: "Retry message",
              metadata: {},
            },
          ])
          .mockResolvedValueOnce([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const twilioMock = {
      sendMessage: jest.fn(),
    } as unknown as TwilioService;

    const service = new BlastsService(
      prismaMock,
      dryRunConfigMock,
      new TemplateRendererService(),
      new ComplianceService(dryRunConfigMock),
      twilioMock,
      eventsMock,
      consentMock,
    );

    const result = await service.retryFailed("blast_retry_dry");

    expect(result).toEqual({ blastId: "blast_retry_dry", retried: 1 });
    expect(twilioMock.sendMessage).not.toHaveBeenCalled();
    expect(prismaMock.blastRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "recipient_retry_dry" },
        data: expect.objectContaining({
          status: BlastRecipientStatus.SENT,
          twilioMessageSid: expect.stringMatching(/^DRYRUN-/),
        }),
      }),
    );
  });

  it("enqueues blast send and retry jobs when BullMQ blast flag is enabled", async () => {
    const prismaMock: any = {
      blast: {
        findUnique: jest.fn().mockResolvedValue({
          id: "blast_1",
          status: BlastStatus.PROOFED,
          audienceId: "aud_1",
          bodyTemplate: "Hi there",
          tenantId: "org_1",
          startedAt: null,
        }),
        findMany: jest.fn().mockResolvedValue([{ id: "blast_1", scheduledFor: new Date() }]),
      },
    };
    const flags = { isBullmqBlastEnabled: () => true } as any;
    const queue = {
      enqueue: jest.fn().mockResolvedValue({ jobId: "blast-send_blast_1", queued: true }),
    };
    const service = new BlastsService(
      prismaMock,
      configMock,
      new TemplateRendererService(),
      new ComplianceService(configMock),
      { sendMessage: jest.fn() } as unknown as TwilioService,
      eventsMock,
      consentMock,
      flags,
      queue as any,
    );

    const sendResult = await service.requestSendNow("blast_1");
    expect(sendResult).toEqual(
      expect.objectContaining({
        queued: true,
        jobId: "blast-send_blast_1",
      }),
    );

    const retryResult = await service.requestRetryFailed("blast_1");
    expect(retryResult).toEqual(
      expect.objectContaining({
        blastId: "blast_1",
        queued: true,
      }),
    );

    const dispatched = await service.dispatchDueScheduled(1);
    expect(dispatched.processed).toBe(1);
    expect(dispatched.results[0]).toEqual(
      expect.objectContaining({
        blastId: "blast_1",
        ok: true,
        queued: true,
      }),
    );
    expect(queue.enqueue).toHaveBeenCalled();
  });
});
