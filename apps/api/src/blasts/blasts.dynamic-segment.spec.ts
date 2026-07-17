import { ConfigService } from "@nestjs/config";
import { AudienceKind, MessageChannel } from "@uprise/db";
import { orderByHash } from "@uprise/segmentation";
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

function build(prismaMock: any, segmentEvaluator?: { evaluate: jest.Mock }) {
  return new BlastsService(
    prismaMock,
    configMock,
    new TemplateRendererService(),
    new ComplianceService(configMock),
    { sendMessage: jest.fn() } as unknown as TwilioService,
    { resolve: async () => undefined, resolveByNumber: async () => undefined, invalidate: () => {} } as any,
    eventsMock,
    consentMock,
    undefined,
    undefined,
    undefined,
    undefined,
    segmentEvaluator as any,
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

  it("orders v2 (seeded) segment recipients by the deterministic hash order (preview == send)", async () => {
    const seed = "seed-blast-spec";
    const memberIds = ["c1", "c2", "c3", "c4"];
    const prismaMock: any = {
      audience: { findFirst: jest.fn().mockResolvedValue({ kind: AudienceKind.STATIC }) },
      audienceSegment: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "seg1", seed, lastEvaluatedAt: new Date() }]),
      },
      audienceSegmentMember: {
        findMany: jest.fn().mockResolvedValue(memberIds.map((contactId) => ({ contactId }))),
      },
      contact: {
        // Deliberately NOT in hash order — the service must reorder.
        findMany: jest.fn().mockResolvedValue(
          memberIds.map((id, i) => ({
            id,
            phoneE164: `+6140000000${i + 1}`,
            metadata: null,
          })),
        ),
      },
      audienceContact: { findMany: jest.fn() },
    };
    const service = build(prismaMock);

    const recipients = await (service as any).getBlastRecipients({
      audienceId: "aud_1",
      id: "blast_1",
      tenantId: "t1",
      channel: MessageChannel.SMS,
    });

    const expectedOrder = orderByHash(memberIds, seed);
    expect(recipients.map((r: { contactId: string }) => r.contactId)).toEqual(expectedOrder);
  });

  it("re-evaluates a stale v2 segment inline before drawing members", async () => {
    const evaluator = { evaluate: jest.fn().mockResolvedValue({ count: 1 }) };
    const stale = new Date(Date.now() - 60 * 60_000); // an hour old > the 15-min default
    const prismaMock: any = {
      audience: { findFirst: jest.fn().mockResolvedValue({ kind: AudienceKind.STATIC }) },
      audienceSegment: {
        findMany: jest.fn().mockResolvedValue([{ id: "seg1", seed: "s", lastEvaluatedAt: stale }]),
      },
      audienceSegmentMember: { findMany: jest.fn().mockResolvedValue([{ contactId: "c1" }]) },
      contact: {
        findMany: jest.fn().mockResolvedValue([{ id: "c1", phoneE164: "+61400000001", metadata: null }]),
      },
      audienceContact: { findMany: jest.fn() },
    };
    const service = build(prismaMock, evaluator);

    await (service as any).getBlastRecipients({
      audienceId: "aud_1",
      id: "blast_1",
      tenantId: "t1",
      channel: MessageChannel.SMS,
    });

    expect(evaluator.evaluate).toHaveBeenCalledWith("seg1");
  });

  it("does NOT re-evaluate a fresh v2 segment, and never re-evaluates legacy (unseeded) segments", async () => {
    const evaluator = { evaluate: jest.fn() };
    const prismaMock: any = {
      audience: { findFirst: jest.fn().mockResolvedValue({ kind: AudienceKind.STATIC }) },
      audienceSegment: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "seg1", seed: "s", lastEvaluatedAt: new Date() }]),
      },
      audienceSegmentMember: { findMany: jest.fn().mockResolvedValue([]) },
      contact: { findMany: jest.fn().mockResolvedValue([]) },
      audienceContact: { findMany: jest.fn() },
    };
    const service = build(prismaMock, evaluator);
    await (service as any).getBlastRecipients({
      audienceId: "aud_1",
      id: "blast_1",
      tenantId: "t1",
      channel: MessageChannel.SMS,
    });
    expect(evaluator.evaluate).not.toHaveBeenCalled();

    // Legacy: no seed → no staleness path even when stale.
    prismaMock.audienceSegment.findMany.mockResolvedValue([
      { id: "seg2", seed: null, lastEvaluatedAt: null },
    ]);
    await (service as any).getBlastRecipients({
      audienceId: "aud_1",
      id: "blast_1",
      tenantId: "t1",
      channel: MessageChannel.SMS,
    });
    expect(evaluator.evaluate).not.toHaveBeenCalled();
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
