import { BlastsService } from "./blasts.service";
import { TemplateRendererService } from "./template-renderer.service";
import { ComplianceService } from "./compliance.service";

// The volunteer P2P slice on BlastsService: prepareP2pBlast (materialise + SENDING),
// sendSingleRecipient (assignee-bound press-send) and the dispatch cron's P2P skip.

const configMock = { get: jest.fn((_k: string, fallback?: unknown) => fallback) } as any;

function makeSender() {
  return {
    resolve: jest.fn(async (): Promise<any> => undefined),
    resolveByNumber: jest.fn(async (): Promise<any> => undefined),
    resolveByNumberId: jest.fn(async (): Promise<any> => undefined),
    invalidate: jest.fn(),
  };
}

function build(prisma: any, opts: { dryRun?: boolean; twilio?: any } = {}) {
  const flags = { isEnabled: jest.fn(async () => opts.dryRun ?? true) } as any;
  const twilio = opts.twilio ?? { sendMessage: jest.fn() };
  const service = new BlastsService(
    prisma,
    configMock,
    new TemplateRendererService(),
    new ComplianceService(configMock),
    twilio as any,
    makeSender() as any,
    { emit: jest.fn() } as any,
    {} as any,
    flags,
  );
  return { service, twilio, flags };
}

const P2P_BLAST = {
  id: "b1",
  tenantId: "t1",
  audienceId: "a1",
  bodyTemplate: "Hi {{first_name}}",
  channel: "SMS",
  contentSid: null,
  contentVariableMap: null,
  fromNumberId: null,
  status: "PROOFED",
  startedAt: null,
  metadata: { p2p: true },
};

describe("isP2pBlast", () => {
  it("is true only for metadata.p2p === true", () => {
    const { service } = build({});
    expect(service.isP2pBlast({ p2p: true })).toBe(true);
    expect(service.isP2pBlast({ p2p: false })).toBe(false);
    expect(service.isP2pBlast({})).toBe(false);
    expect(service.isP2pBlast(null)).toBe(false);
    expect(service.isP2pBlast([1] as any)).toBe(false);
  });
});

describe("prepareP2pBlast", () => {
  function prismaFor(blast: any) {
    return {
      blast: {
        findFirst: jest.fn(async () => blast),
        update: jest.fn(async ({ data }: any) => ({ ...blast, ...data })),
        findUniqueOrThrow: jest.fn(async () => ({ ...blast, status: "SENDING" })),
      },
      // ensureBlastRecipientRecords path — no audience rows needed when recipients exist.
      blastRecipient: { count: jest.fn(async () => 5), findMany: jest.fn(async () => []) },
      audience: { findUnique: jest.fn(async () => null) },
    } as any;
  }

  it("rejects a non-P2P blast", async () => {
    const prisma = prismaFor({ ...P2P_BLAST, metadata: {} });
    const { service } = build(prisma);
    await expect(service.prepareP2pBlast("t1", "b1")).rejects.toMatchObject({
      response: { error: { code: "BLAST_NOT_P2P" } },
    });
  });

  it("moves PROOFED → SENDING and stamps startedAt", async () => {
    const prisma = prismaFor(P2P_BLAST);
    const { service } = build(prisma);
    await service.prepareP2pBlast("t1", "b1");
    expect(prisma.blast.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SENDING", startedAt: expect.any(Date) }),
      }),
    );
  });

  it("is idempotent once SENDING (no second transition)", async () => {
    const prisma = prismaFor({ ...P2P_BLAST, status: "SENDING", startedAt: new Date() });
    const { service } = build(prisma);
    await service.prepareP2pBlast("t1", "b1");
    expect(prisma.blast.update).not.toHaveBeenCalled();
  });
});

describe("sendSingleRecipient", () => {
  const RECIPIENT = {
    id: "r1",
    blastId: "b1",
    phoneE164: "+61400000001",
    renderedBody: "Hi Pat",
    status: "PENDING",
    assigneeId: "vol1",
    metadata: null,
    blast: { ...P2P_BLAST, status: "SENDING" },
  };

  function prismaFor(recipient: any, extra: Partial<Record<string, any>> = {}) {
    const prisma: any = {
      $transaction: (cb: any) => cb(prisma),
      blastRecipient: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(recipient) // the recipient load
          .mockResolvedValueOnce(extra.duplicate ?? null), // the duplicate-phone probe
        update: jest.fn(async ({ data }: any) => ({ ...recipient, ...data })),
        count: jest.fn(async () => 0),
        groupBy: jest.fn(async () => []),
        findMany: jest.fn(async () => []),
      },
      outboundMessage: { create: jest.fn(async ({ data }: any) => data) },
      blast: {
        findUnique: jest.fn(async () => recipient.blast),
        update: jest.fn(async () => recipient.blast),
      },
      ...extra.prisma,
    };
    return prisma;
  }

  it("404s an unknown recipient", async () => {
    const prisma = { blastRecipient: { findFirst: jest.fn(async () => null) } } as any;
    const { service } = build(prisma);
    await expect(service.sendSingleRecipient("t1", "nope", "vol1")).rejects.toMatchObject({
      response: { error: { code: "RECIPIENT_NOT_FOUND" } },
    });
  });

  it("403s when assigned to someone else — the press-send is assignee-bound", async () => {
    const prisma = prismaFor({ ...RECIPIENT, assigneeId: "someone_else" });
    const { service } = build(prisma);
    await expect(service.sendSingleRecipient("t1", "r1", "vol1")).rejects.toMatchObject({
      response: { error: { code: "RECIPIENT_NOT_ASSIGNED" } },
    });
  });

  it("409s when already handled", async () => {
    const prisma = prismaFor({ ...RECIPIENT, status: "SENT" });
    const { service } = build(prisma);
    await expect(service.sendSingleRecipient("t1", "r1", "vol1")).rejects.toMatchObject({
      response: { error: { code: "RECIPIENT_ALREADY_SENT" } },
    });
  });

  it("skips a duplicate phone already sent in the same blast", async () => {
    const prisma = prismaFor(RECIPIENT, { duplicate: { id: "r0" } });
    const { service } = build(prisma);
    const res = await service.sendSingleRecipient("t1", "r1", "vol1");
    expect(res.outcome).toBe("skipped_duplicate");
    expect(prisma.blastRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED" }) }),
    );
    expect(prisma.outboundMessage.create).not.toHaveBeenCalled();
  });

  it("sends (dry-run) → recipient SENT + OutboundMessage written + status recalculated", async () => {
    const prisma = prismaFor(RECIPIENT);
    const { service } = build(prisma);
    const res = await service.sendSingleRecipient("t1", "r1", "vol1");
    expect(res.outcome).toBe("sent");
    expect(prisma.blastRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SENT", twilioMessageSid: expect.any(String) }),
      }),
    );
    expect(prisma.outboundMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "t1", blastId: "b1", recipientId: "r1" }),
      }),
    );
  });

  it("classifies a live send failure → recipient FAILED, outcome failed", async () => {
    const twilio = { sendMessage: jest.fn(async () => { throw new Error("boom 30007"); }) };
    const prisma = prismaFor(RECIPIENT);
    const { service } = build(prisma, { dryRun: false, twilio });
    const res = await service.sendSingleRecipient("t1", "r1", "vol1");
    expect(res.outcome).toBe("failed");
    expect(prisma.blastRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });
});

describe("dispatchDueScheduled — P2P skip", () => {
  it("never batch-sends a P2P blast", async () => {
    const prisma = {
      blast: {
        findMany: jest.fn(async () => [
          { id: "p2p1", metadata: { p2p: true }, scheduledFor: null },
        ]),
      },
    } as any;
    const { service } = build(prisma);
    const sendNow = jest.spyOn(service, "sendNow").mockResolvedValue({} as any);
    const out = await service.dispatchDueScheduled(10);
    expect(sendNow).not.toHaveBeenCalled();
    expect(out.results[0]).toMatchObject({ blastId: "p2p1", skippedP2p: true });
  });
});
