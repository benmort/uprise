import { ConfigService } from "@nestjs/config";
import { BlastsService } from "./blasts.service";
import { TemplateRendererService } from "./template-renderer.service";
import { ComplianceService } from "./compliance.service";
import { TwilioService } from "../twilio/twilio.service";
import { RealtimeEventsService } from "../common/events/realtime-events.service";

describe("BlastsService integration-like flow", () => {
  it("creates and sends blast recipients", async () => {
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
        update: jest.fn().mockResolvedValue({
          id: "blast_1",
          organizationId: "org_1",
          audienceId: "aud_1",
          status: "SENT",
        }),
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
        ]),
      },
      blastRecipient: {
        create: jest.fn().mockResolvedValue({ id: "recipient_1" }),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "recipient_1",
            phoneE164: "+15551234567",
            renderedBody: "Hi Alice",
          },
        ]),
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

    const configMock = {
      get: (_: string, fallback?: string) => fallback ?? "default",
    } as ConfigService;

    const eventsMock = {
      emit: jest.fn(),
    } as unknown as RealtimeEventsService;

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
    expect(prismaMock.blastRecipient.create).toHaveBeenCalledTimes(1);
    expect(twilioMock.sendMessage).toHaveBeenCalledTimes(1);
  });
});
