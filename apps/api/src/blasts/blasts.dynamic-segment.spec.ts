import { ConfigService } from "@nestjs/config";
import { AudienceKind, MessageChannel } from "@uprise/db";
import { BlastsService } from "./blasts.service";
import { TemplateRendererService } from "./template-renderer.service";
import { ComplianceService } from "./compliance.service";
import { TwilioService } from "../twilio/twilio.service";
import { RealtimeEventsService } from "../common/events/realtime-events.service";
import { ConsentService } from "../messaging/consent.service";

const configMock = { get: (_: string, fallback?: string) => fallback ?? "default" } as ConfigService;
const eventsMock = { emit: jest.fn() } as unknown as RealtimeEventsService;
const consentMock = {
  getStatesForPhones: jest.fn().mockResolvedValue(new Map()),
  canSend: jest.fn().mockReturnValue(true),
} as unknown as ConsentService;

function build(prismaMock: any) {
  return new BlastsService(
    prismaMock,
    configMock,
    new TemplateRendererService(),
    new ComplianceService(configMock),
    { sendMessage: jest.fn() } as unknown as TwilioService,
    { resolve: async () => undefined, resolveByNumber: async () => undefined, invalidate: () => {} } as any,
    eventsMock,
    consentMock,
  );
}

describe("BlastsService — dynamic-segment recipients (meld doc 10)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("resolves recipients from AudienceSegmentMember when the audience has a DYNAMIC segment", async () => {
    const prismaMock: any = {
      audience: { findFirst: jest.fn().mockResolvedValue({ kind: AudienceKind.STATIC }) },
      audienceSegment: { findMany: jest.fn().mockResolvedValue([{ id: "seg1" }]) },
      audienceSegmentMember: {
        findMany: jest.fn().mockResolvedValue([{ contactId: "c1" }, { contactId: "c2" }]),
      },
      contact: {
        findMany: jest.fn().mockResolvedValue([
          { id: "c1", phoneE164: "+61400000001", metadata: null },
          { id: "c2", phoneE164: "+61400000002", metadata: { source: "an" } },
        ]),
      },
      audienceContact: { findMany: jest.fn() }, // must NOT be used on the dynamic path
    };
    const service = build(prismaMock);

    const recipients = await (service as any).getBlastRecipients({
      audienceId: "aud_1",
      id: "blast_1",
      tenantId: "t1",
      channel: MessageChannel.SMS,
    });

    expect(prismaMock.audienceSegment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { audienceId: "aud_1", tenantId: "t1", type: "DYNAMIC" },
      }),
    );
    expect(prismaMock.audienceContact.findMany).not.toHaveBeenCalled();
    expect(recipients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contactId: "c1", phoneE164: "+61400000001" }),
        expect.objectContaining({ contactId: "c2", phoneE164: "+61400000002" }),
      ]),
    );
    expect(recipients).toHaveLength(2);
  });

  it("falls back to the static AudienceContact list when there are no dynamic segments", async () => {
    const prismaMock: any = {
      audience: { findFirst: jest.fn().mockResolvedValue({ kind: AudienceKind.STATIC }) },
      audienceSegment: { findMany: jest.fn().mockResolvedValue([]) },
      audienceSegmentMember: { findMany: jest.fn() },
      contact: { findMany: jest.fn() },
      audienceContact: {
        findMany: jest.fn().mockResolvedValue([
          { contactId: "c1", phoneE164: "+61400000001", metadata: null },
        ]),
      },
    };
    const service = build(prismaMock);

    const recipients = await (service as any).getBlastRecipients({
      audienceId: "aud_1",
      id: "blast_1",
      tenantId: "t1",
      channel: MessageChannel.SMS,
    });

    expect(prismaMock.audienceContact.findMany).toHaveBeenCalled();
    expect(prismaMock.audienceSegmentMember.findMany).not.toHaveBeenCalled();
    expect(recipients).toHaveLength(1);
    expect(recipients[0]).toEqual(expect.objectContaining({ contactId: "c1" }));
  });
});
