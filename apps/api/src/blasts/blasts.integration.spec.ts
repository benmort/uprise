import { ConfigService } from "@nestjs/config";
import { BlastRecipientStatus } from "../../src/generated/prisma";
import { BlastsService } from "./blasts.service";
import { TemplateRendererService } from "./template-renderer.service";
import { ComplianceService } from "./compliance.service";
import { TwilioService } from "../twilio/twilio.service";
import { RealtimeEventsService } from "../common/events/realtime-events.service";

describe("BlastsService integration-like flow", () => {
  const configMock = {
    get: (_: string, fallback?: string) => fallback ?? "default",
  } as ConfigService;

  const eventsMock = {
    emit: jest.fn(),
  } as unknown as RealtimeEventsService;

  it("creates and sends one recipient when audience includes duplicate phones", async () => {
    const prismaMock: any = {
      organization: {
        upsert: jest.fn().mockResolvedValue({ id: "org_1", slug: "default" }),
      },
      blast: {
        create: jest.fn().mockResolvedValue({
          id: "blast_1",
          organizationId: "org_1",
          audienceId: "aud_1",
          bodyTemplate: "Hi {{first_name}}",
          status: "DRAFTED",
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: "blast_1",
          organizationId: "org_1",
          audienceId: "aud_1",
          bodyTemplate: "Hi {{first_name}}",
          status: "PROOFED",
        }),
        update: jest.fn().mockImplementation(async ({ data }: { data: { status: string } }) => ({
          id: "blast_1",
          organizationId: "org_1",
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
      organization: {
        upsert: jest.fn().mockResolvedValue({ id: "org_1", slug: "default" }),
      },
      blast: {
        findUnique: jest.fn().mockResolvedValue({
          id: "blast_1",
          organizationId: "org_1",
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
          organizationId: "org_1",
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
          .mockResolvedValueOnce([{ phoneE164: "+15551234567" }]),
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
    );

    const sent = await service.sendNow("blast_1");

    expect(sent.sent).toBe(0);
    expect(sent.skipped).toBe(1);
    expect(twilioMock.sendMessage).not.toHaveBeenCalled();
    expect(prismaMock.blastRecipient.update).toHaveBeenCalledWith({
      where: { id: "recipient_duplicate" },
      data: {
        status: "SKIPPED",
        errorMessage: "Skipped duplicate recipient: message already sent for this blast.",
      },
    });
  });

  it("marks delivered from callback and preserves responded recipient status", async () => {
    const prismaMock: any = {
      blastRecipient: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "recipient_sent",
            status: BlastRecipientStatus.SENT,
            deliveredAt: null,
            errorCode: null,
            errorMessage: null,
          },
          {
            id: "recipient_responded",
            status: BlastRecipientStatus.RESPONDED,
            deliveredAt: null,
            errorCode: null,
            errorMessage: null,
          },
        ]),
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
    expect(prismaMock.blastRecipient.update).toHaveBeenNthCalledWith(1, {
      where: { id: "recipient_sent" },
      data: {
        status: BlastRecipientStatus.DELIVERED,
        deliveredAt: expect.any(Date),
      },
    });
    expect(prismaMock.blastRecipient.update).toHaveBeenNthCalledWith(2, {
      where: { id: "recipient_responded" },
      data: {
        deliveredAt: expect.any(Date),
      },
    });
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
});
