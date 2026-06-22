import { ConfigService } from "@nestjs/config";
import {
  BlastRecipientStatus,
  BlastStatus,
} from "@yarns/db";
import { BasicAuthGuard } from "../auth/basic-auth.guard";
import { BlastsService } from "../blasts/blasts.service";

describe("workflow e2e-style", () => {
  const prisma = {
    tenant: { upsert: jest.fn() },
    blast: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    audience: { findFirst: jest.fn().mockResolvedValue(null) },
    audienceSegment: { findMany: jest.fn().mockResolvedValue([]) },
    audienceContact: { findMany: jest.fn() },
    blastRecipient: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    outboundMessage: { create: jest.fn() },
    analyticsSnapshot: { create: jest.fn() },
  } as any;
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === "DEFAULT_ORGANIZATION_SLUG") return "default";
      if (key === "BLAST_SEND_BATCH_SIZE") return "1";
      return fallback;
    }),
  } as unknown as ConfigService;
  const renderer = {
    render: jest.fn((template: string) => template),
  } as any;
  const compliance = {
    validateMessageForSend: jest.fn(() => ({ warnings: [] })),
  } as any;
  const twilio = {
    sendMessage: jest.fn(),
  } as any;
  const events = {
    emit: jest.fn(),
  } as any;
  const consent = {
    getStatesForPhones: jest.fn(),
    canSend: jest.fn(),
  } as any;

  let service: BlastsService;

  beforeEach(() => {
    jest.resetAllMocks();
    (config.get as jest.Mock).mockImplementation((key: string, fallback?: string) => {
      if (key === "DEFAULT_ORGANIZATION_SLUG") return "default";
      if (key === "BLAST_SEND_BATCH_SIZE") return "1";
      if (key === "BLAST_DISPATCH_BATCH_SIZE") return "50";
      return fallback;
    });
    renderer.render.mockImplementation((template: string) => template);
    compliance.validateMessageForSend.mockImplementation(() => ({ warnings: [] }));
    consent.getStatesForPhones.mockResolvedValue(new Map());
    consent.canSend.mockReturnValue(true);
    prisma.audienceSegment.findMany.mockResolvedValue([]);
    service = new BlastsService(
      prisma,
      config,
      renderer,
      compliance,
      twilio,
      events,
      consent,
    );
  });

  it("schedules and sends a blast in bounded batches", async () => {
    const scheduledFor = new Date("2026-05-09T10:00:00.000Z");
    prisma.blast.findUnique
      .mockResolvedValueOnce({
        id: "blast_1",
        status: BlastStatus.PROOFED,
        audienceId: "aud_1",
        bodyTemplate: "Hi there",
        tenantId: "org_1",
        startedAt: null,
      })
      .mockResolvedValueOnce({
        id: "blast_1",
        status: BlastStatus.SCHEDULED,
        audienceId: "aud_1",
        bodyTemplate: "Hi there",
        tenantId: "org_1",
        startedAt: null,
      })
      .mockResolvedValueOnce({
        id: "blast_1",
        status: BlastStatus.SENDING,
        audienceId: "aud_1",
        bodyTemplate: "Hi there",
        tenantId: "org_1",
        startedAt: new Date(),
        completedAt: null,
      })
      .mockResolvedValueOnce({
        id: "blast_1",
        status: BlastStatus.SENDING,
        audienceId: "aud_1",
        bodyTemplate: "Hi there",
        tenantId: "org_1",
        startedAt: new Date(),
      });
    prisma.blast.update
      .mockResolvedValueOnce({
        id: "blast_1",
        status: BlastStatus.SCHEDULED,
        scheduledFor,
      })
      .mockResolvedValueOnce({
        id: "blast_1",
        status: BlastStatus.SENDING,
      })
      .mockResolvedValueOnce({
        id: "blast_1",
        status: BlastStatus.SENDING,
      });
    prisma.blastRecipient.count
      .mockResolvedValueOnce(2) // existing recipients, skip seeding
      .mockResolvedValueOnce(1); // remaining
    prisma.blastRecipient.findMany
      .mockResolvedValueOnce([
        {
          id: "recipient_1",
          phoneE164: "+15551234567",
          renderedBody: "Hi there",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    twilio.sendMessage.mockResolvedValue({
      sid: "SM123",
      body: "Hi there",
      from: "+15550000001",
      to: "+15551234567",
      dateCreated: new Date().toISOString(),
      dateSent: new Date().toISOString(),
    });
    prisma.blastRecipient.update.mockResolvedValue({});
    prisma.outboundMessage.create.mockResolvedValue({});
    prisma.analyticsSnapshot.create.mockResolvedValue({});

    const scheduled = await service.schedule("blast_1", {
      scheduledFor: scheduledFor.toISOString(),
    });
    expect(scheduled.status).toBe(BlastStatus.SCHEDULED);

    const result = await service.sendNow("blast_1");
    expect(twilio.sendMessage).toHaveBeenCalledTimes(1);
    expect(result.batchSize).toBe(1);
    expect(result.remaining).toBe(1);
    expect(result.blast.status).toBe(BlastStatus.SENDING);
  });

  it("dispatches due scheduled blasts and returns per-blast outcomes", async () => {
    prisma.blast.findMany.mockResolvedValue([
      { id: "blast_ok" },
      { id: "blast_fail" },
    ]);
    const sendSpy = jest
      .spyOn(service, "sendNow")
      .mockResolvedValueOnce({
        blast: { status: BlastStatus.SENDING },
        sent: 1,
        failed: 0,
        remaining: 3,
        batchSize: 50,
      } as any)
      .mockRejectedValueOnce(new Error("twilio timeout"));

    // The arg to dispatchDueScheduled is the blast *limit*; each send uses the
    // configured dispatch batch size (BLAST_DISPATCH_BATCH_SIZE), resolved independently.
    const dispatched = await service.dispatchDueScheduled(5);
    expect(sendSpy).toHaveBeenCalledWith("blast_ok", 50);
    expect(sendSpy).toHaveBeenCalledWith("blast_fail", 50);
    expect(dispatched.processed).toBe(2);
    expect(dispatched.results).toEqual([
      expect.objectContaining({ blastId: "blast_ok", ok: true, batchSize: 50 }),
      expect.objectContaining({ blastId: "blast_fail", ok: false }),
    ]);
  });

  it("seeds recipients from audience contacts when none exist yet", async () => {
    prisma.blast.findUnique
      .mockResolvedValueOnce({
        id: "blast_seed",
        status: BlastStatus.PROOFED,
        audienceId: "aud_seed",
        bodyTemplate: "Hello {{first_name}}",
        tenantId: "org_1",
        startedAt: null,
      })
      .mockResolvedValueOnce({
        id: "blast_seed",
        status: BlastStatus.SENDING,
        audienceId: "aud_seed",
        bodyTemplate: "Hello {{first_name}}",
        tenantId: "org_1",
        startedAt: new Date(),
        completedAt: null,
      })
      .mockResolvedValueOnce({
        id: "blast_seed",
        status: BlastStatus.SENT,
        audienceId: "aud_seed",
        bodyTemplate: "Hello {{first_name}}",
        tenantId: "org_1",
        startedAt: new Date(),
      });
    prisma.blast.update
      .mockResolvedValueOnce({ id: "blast_seed", status: BlastStatus.SENDING })
      .mockResolvedValueOnce({ id: "blast_seed", status: BlastStatus.SENT });
    prisma.blastRecipient.count
      .mockResolvedValueOnce(0) // no existing recipients
      .mockResolvedValueOnce(1) // count after seeding
      .mockResolvedValueOnce(0); // remaining
    prisma.audienceContact.findMany.mockResolvedValue([
      {
        id: "contact_1",
        phoneE164: "+15551110001",
        metadata: { first_name: "Taylor" },
      },
    ]);
    prisma.blastRecipient.create.mockResolvedValue({});
    prisma.blastRecipient.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.analyticsSnapshot.create.mockResolvedValue({});

    const result = await service.sendNow("blast_seed");
    expect(prisma.blastRecipient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blastId: "blast_seed",
          status: BlastRecipientStatus.PENDING,
        }),
      }),
    );
    expect(result.blast.status).toBe(BlastStatus.SENT);
  });

  it("allows inbound webhook path without basic auth under api prefix", () => {
    const guard = new BasicAuthGuard({
      get: (key: string) => {
        if (key === "BASIC_AUTH_USERNAME") return "admin";
        if (key === "BASIC_AUTH_PASSWORD") return "secret";
        if (key === "STREAM_TOKEN_SECRET") return "";
        if (key === "INTEGRATION_CREDENTIAL_SECRET") return "integration-secret";
        return undefined;
      },
    } as ConfigService);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          path: "/api/v1/inbound-text-message-hook",
          originalUrl: "/api/v1/inbound-text-message-hook",
          query: {},
          headers: {},
        }),
      }),
    } as any;
    expect(guard.canActivate(context)).toBe(true);
  });
});
