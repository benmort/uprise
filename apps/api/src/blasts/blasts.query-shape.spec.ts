import { ConfigService } from "@nestjs/config";
import { BlastRecipientStatus, BlastStatus } from "@uprise/db";
import { BlastsService } from "./blasts.service";
import { TemplateRendererService } from "./template-renderer.service";
import { ComplianceService } from "./compliance.service";
import { TwilioService } from "../twilio/twilio.service";
import { RealtimeEventsService } from "../common/events/realtime-events.service";
import { ConsentService } from "../messaging/consent.service";
import { scopeFromStoredFailure } from "./twilio-failure-scope";

/**
 * Query-shape guards for the blast send path: the seeding loop is a chunked
 * createMany, the duplicate guard is scoped to the batch, the callback status
 * recomputation is a count plus a residual, and retryFailed is bounded. Each test
 * pins the SHAPE of the query, because a regression here is a silent perf cliff
 * rather than a behavioural failure.
 */
describe("BlastsService send-path query shapes", () => {
  const configFor = (overrides: Record<string, string> = {}) =>
    ({
      get: (key: string, fallback?: string) => overrides[key] ?? fallback ?? "default",
    }) as ConfigService;

  const eventsMock = { emit: jest.fn() } as unknown as RealtimeEventsService;
  const consentMock = {
    getStatesForPhones: jest.fn().mockResolvedValue(new Map()),
    canSend: jest.fn().mockReturnValue(true),
  } as unknown as ConsentService;
  const senderResolverMock = {
    resolve: async () => undefined,
    resolveByNumber: async () => undefined,
    invalidate: () => {},
  } as any;

  const build = (
    prismaMock: any,
    twilioMock: TwilioService,
    config: ConfigService = configFor(),
    outbox?: { append: jest.Mock },
  ) =>
    new BlastsService(
      prismaMock,
      config,
      new TemplateRendererService(),
      new ComplianceService(config),
      twilioMock,
      senderResolverMock,
      eventsMock,
      consentMock,
      undefined,
      undefined,
      undefined,
      outbox as any,
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("recipient seeding (chunked createMany)", () => {
    const seedPrisma = (contactCount: number, createManyCounts: number[]) => {
      const contacts = Array.from({ length: contactCount }, (_, index) => ({
        id: `contact_${index}`,
        contactId: `contact_${index}`,
        phoneE164: `+1555${String(index).padStart(7, "0")}`,
        metadata: { first_name: `Person ${index}` },
      }));
      const createMany = jest.fn();
      for (const count of createManyCounts) createMany.mockResolvedValueOnce({ count });
      const prismaMock: any = {
        $transaction: (cb: any) => cb(prismaMock),
        blast: {
          findUnique: jest.fn().mockResolvedValue({
            id: "blast_seed",
            tenantId: "org_1",
            audienceId: "aud_1",
            bodyTemplate: "Hi {{first_name}}",
            title: "Campaign",
            status: BlastStatus.SENDING,
            proofedAt: new Date(),
            startedAt: new Date(),
            completedAt: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        audience: { findFirst: jest.fn().mockResolvedValue(null) },
        audienceSegment: { findMany: jest.fn().mockResolvedValue([]) },
        audienceContact: { findMany: jest.fn().mockResolvedValue(contacts) },
        blastRecipient: {
          // Pre-seed count, post-seed count, then recalculate's remaining +
          // INTERNAL_-prefix counts.
          count: jest
            .fn()
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(contactCount)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0),
          createMany,
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockResolvedValue({}),
        },
        outboundMessage: { create: jest.fn().mockResolvedValue({}) },
        analyticsSnapshot: { create: jest.fn().mockResolvedValue({}) },
      };
      return { prismaMock, createMany };
    };

    it("chunks the seed into createMany batches of 1,000 with skipDuplicates", async () => {
      const { prismaMock, createMany } = seedPrisma(2_500, [1_000, 1_000, 500]);
      const service = build(prismaMock, { sendMessage: jest.fn() } as unknown as TwilioService);

      await service.sendNow("blast_seed");

      expect(createMany).toHaveBeenCalledTimes(3);
      expect(createMany.mock.calls.map(([arg]) => arg.data.length)).toEqual([1_000, 1_000, 500]);
      for (const [arg] of createMany.mock.calls) {
        expect(arg.skipDuplicates).toBe(true);
      }
      // Every row is precomputed the same way the per-row create used to build it.
      const firstRow = createMany.mock.calls[0][0].data[0];
      expect(firstRow).toEqual(
        expect.objectContaining({
          blastId: "blast_seed",
          contactId: "contact_0",
          phoneE164: "+15550000000",
          renderedBody: "Hi Person 0",
          status: BlastRecipientStatus.PENDING,
        }),
      );
      expect(firstRow.metadata).toEqual(
        expect.objectContaining({
          context: { first_name: "Person 0" },
          trace: [expect.objectContaining({ source: "seed", status: BlastRecipientStatus.PENDING })],
        }),
      );
      // No chunk boundary is skipped: the last chunk is the remainder, not a full one.
      expect(createMany.mock.calls[2][0].data[0].contactId).toBe("contact_2000");
    });

    it("derives skipped duplicates as input rows minus the createMany counts", async () => {
      // Two of the three rows collide on @@unique([blastId, phoneE164]) and are
      // swallowed by skipDuplicates, exactly as the old P2002 catch did.
      const { prismaMock } = seedPrisma(3, [1]);
      const service = build(prismaMock, { sendMessage: jest.fn() } as unknown as TwilioService);
      const warnSpy = jest.spyOn((service as any).logger, "warn").mockImplementation(() => {});

      await service.sendNow("blast_seed");

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Skipped duplicate recipient records during blast seed"),
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("skipped=2"));
    });

    it("logs no duplicate warning when every row is inserted", async () => {
      const { prismaMock } = seedPrisma(3, [3]);
      const service = build(prismaMock, { sendMessage: jest.fn() } as unknown as TwilioService);
      const warnSpy = jest.spyOn((service as any).logger, "warn").mockImplementation(() => {});

      await service.sendNow("blast_seed");

      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Skipped duplicate recipient records during blast seed"),
      );
    });
  });

  describe("batch-scoped duplicate guard", () => {
    const guardPrisma = (pending: Array<{ id: string; phoneE164: string }>, alreadySent: string[]) => {
      const prismaMock: any = {
        $transaction: (cb: any) => cb(prismaMock),
        blast: {
          findUnique: jest.fn().mockResolvedValue({
            id: "blast_dup",
            tenantId: "org_1",
            audienceId: "aud_1",
            bodyTemplate: "Hi",
            title: "Campaign",
            status: BlastStatus.SENDING,
            proofedAt: new Date(),
            startedAt: new Date(),
            completedAt: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        blastRecipient: {
          count: jest
            .fn()
            // Recipients already exist, so seeding is skipped; then recalculate's
            // remaining + INTERNAL_-prefix counts.
            .mockResolvedValueOnce(pending.length || 1)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0),
          findMany: jest
            .fn()
            // pending batch
            .mockResolvedValueOnce(pending.map((r) => ({ ...r, renderedBody: "Hi", metadata: {} })))
            // already-sent phones within this batch
            .mockResolvedValueOnce(alreadySent.map((phoneE164) => ({ phoneE164 })))
            // recalculate residual failures
            .mockResolvedValueOnce([]),
          update: jest.fn().mockResolvedValue({}),
        },
        outboundMessage: { create: jest.fn().mockResolvedValue({}) },
        analyticsSnapshot: { create: jest.fn().mockResolvedValue({}) },
      };
      return prismaMock;
    };

    it("scopes the already-sent lookup to this batch's phones only", async () => {
      const prismaMock = guardPrisma(
        [
          { id: "r1", phoneE164: "+15550000001" },
          { id: "r2", phoneE164: "+15550000002" },
          // Same phone twice inside the batch – the in-batch guard handles this one.
          { id: "r3", phoneE164: "+15550000002" },
        ],
        [],
      );
      const twilioMock = {
        sendMessage: jest.fn().mockResolvedValue({
          sid: "SM1",
          dateCreated: new Date().toISOString(),
          dateSent: new Date().toISOString(),
        }),
      } as unknown as TwilioService;
      const service = build(prismaMock, twilioMock);

      const result = await service.sendNow("blast_dup");

      const sentLookup = prismaMock.blastRecipient.findMany.mock.calls[1][0];
      expect(sentLookup.where).toEqual({
        blastId: "blast_dup",
        phoneE164: { in: ["+15550000001", "+15550000002"] },
        status: { in: expect.arrayContaining([BlastRecipientStatus.SENT]) },
      });
      expect(sentLookup.select).toEqual({ phoneE164: true });
      // In-batch duplicate still skipped by the sentPhones set, not by the query.
      expect(result.sent).toBe(2);
      expect(result.skipped).toBe(1);
    });

    it("still SKIPs a phone that a previous batch already sent", async () => {
      const prismaMock = guardPrisma([{ id: "r_dup", phoneE164: "+15550000009" }], ["+15550000009"]);
      const twilioMock = { sendMessage: jest.fn() } as unknown as TwilioService;
      const service = build(prismaMock, twilioMock);

      const result = await service.sendNow("blast_dup");

      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(1);
      expect(twilioMock.sendMessage).not.toHaveBeenCalled();
      expect(prismaMock.blastRecipient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "r_dup" },
          data: expect.objectContaining({
            status: BlastRecipientStatus.SKIPPED,
            failureCategory: "EXTERNAL_DUPLICATE_RECIPIENT",
          }),
        }),
      );
    });

    it("short-circuits the already-sent lookup when the batch is empty", async () => {
      const prismaMock = guardPrisma([], []);
      // With no pending rows the second findMany is recalculate's residual fetch.
      prismaMock.blastRecipient.findMany = jest.fn().mockResolvedValue([]);
      const service = build(prismaMock, { sendMessage: jest.fn() } as unknown as TwilioService);

      await service.sendNow("blast_dup");

      for (const [arg] of prismaMock.blastRecipient.findMany.mock.calls) {
        expect(arg.where).not.toHaveProperty("phoneE164");
      }
    });
  });

  describe("recalculateBlastStatus internal-failure parity", () => {
    type Row = { failureCategory: string | null; errorCode: string | null; errorMessage: string | null };

    // What the pre-rewrite code did: load every FAILED row and classify all of them.
    const legacyInternalFailures = (rows: Row[]) =>
      rows.filter((row) => scopeFromStoredFailure(row) === "INTERNAL").length;

    // What the DB now decides by prefix vs what still comes back to be classified.
    const decidedByPrefix = (rows: Row[]) =>
      rows.filter((row) => row.failureCategory?.startsWith("INTERNAL_")).length;
    const residual = (rows: Row[]) =>
      rows.filter(
        (row) =>
          row.failureCategory === null ||
          !(
            row.failureCategory.startsWith("INTERNAL_") ||
            row.failureCategory.startsWith("EXTERNAL_")
          ),
      );

    const fixtures: Array<{ name: string; rows: Row[] }> = [
      { name: "no failures at all", rows: [] },
      {
        name: "INTERNAL_ prefixed only",
        rows: [
          { failureCategory: "INTERNAL_NETWORK", errorCode: null, errorMessage: "timeout" },
          { failureCategory: "INTERNAL_AUTH", errorCode: null, errorMessage: "401" },
        ],
      },
      {
        name: "EXTERNAL_ prefixed only",
        rows: [
          {
            failureCategory: "EXTERNAL_CARRIER_OR_DESTINATION",
            errorCode: "30008",
            errorMessage: "Unknown destination handset",
          },
          { failureCategory: "EXTERNAL_RECIPIENT_OPTOUT", errorCode: "21610", errorMessage: "stop" },
        ],
      },
      {
        name: "null category that classifies internal",
        rows: [{ failureCategory: null, errorCode: null, errorMessage: "socket hang up" }],
      },
      {
        name: "null category that classifies external",
        rows: [{ failureCategory: null, errorCode: "21610", errorMessage: "opted out" }],
      },
      {
        name: "odd casing the SQL prefix cannot decide",
        rows: [
          { failureCategory: "internal_network", errorCode: null, errorMessage: "timeout" },
          { failureCategory: "external_recipient_optout", errorCode: "21610", errorMessage: "stop" },
        ],
      },
      {
        name: "mixed prefixed, null and odd rows",
        rows: [
          { failureCategory: "INTERNAL_PROVIDER", errorCode: null, errorMessage: "503" },
          { failureCategory: "EXTERNAL_INVALID_DESTINATION", errorCode: "21211", errorMessage: "bad to" },
          { failureCategory: null, errorCode: null, errorMessage: "unexpected upstream failure" },
          { failureCategory: "internal_unknown", errorCode: null, errorMessage: "who knows" },
          { failureCategory: "WEIRD_LEGACY_VALUE", errorCode: "21610", errorMessage: "opted out" },
        ],
      },
    ];

    it.each(fixtures)("matches the old classify-all result for $name", async ({ rows }) => {
      const expectedInternal = legacyInternalFailures(rows);
      const prismaMock: any = {
        $transaction: (cb: any) => cb(prismaMock),
        blast: {
          findUnique: jest.fn().mockResolvedValue({
            id: "blast_parity",
            tenantId: "org_1",
            status: BlastStatus.SENDING,
            completedAt: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        blastRecipient: {
          // remaining, then the INTERNAL_ prefix count the DB now answers.
          count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(decidedByPrefix(rows)),
          findMany: jest.fn().mockResolvedValue(residual(rows)),
        },
        outboundMessage: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const service = build(prismaMock, { sendMessage: jest.fn() } as unknown as TwilioService);

      const result = await (service as any).recalculateBlastStatus("blast_parity");

      expect(result.internalFailures).toBe(expectedInternal);
      expect(result.status).toBe(expectedInternal > 0 ? BlastStatus.FAILED : BlastStatus.SENT);
      // The residual fetch only asks for the three columns the classifier needs.
      expect(prismaMock.blastRecipient.findMany.mock.calls[0][0].select).toEqual({
        failureCategory: true,
        errorCode: true,
        errorMessage: true,
      });
    });

    it("stays SENDING (and skips the failure classification result) while work remains", async () => {
      const prismaMock: any = {
        $transaction: (cb: any) => cb(prismaMock),
        blast: {
          findUnique: jest.fn().mockResolvedValue({
            id: "blast_pending",
            tenantId: "org_1",
            status: BlastStatus.SENDING,
            completedAt: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        blastRecipient: {
          count: jest.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(2),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const service = build(prismaMock, { sendMessage: jest.fn() } as unknown as TwilioService);

      const result = await (service as any).recalculateBlastStatus("blast_pending");

      expect(result).toEqual(
        expect.objectContaining({ status: BlastStatus.SENDING, remaining: 4, internalFailures: 2 }),
      );
      expect(prismaMock.blast.update).not.toHaveBeenCalled();
    });

    it("emits messaging.blast.sent exactly once on the transition into SENT", async () => {
      const outbox = { append: jest.fn().mockResolvedValue(undefined) };
      const prismaMock: any = {
        $transaction: (cb: any) => cb(prismaMock),
        blast: {
          findUnique: jest.fn().mockResolvedValue({
            id: "blast_sent",
            tenantId: "org_1",
            status: BlastStatus.SENDING,
            completedAt: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        blastRecipient: {
          count: jest
            .fn()
            // remaining, internal-prefix, then the recipientCount inside the tx.
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(42),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const service = build(
        prismaMock,
        { sendMessage: jest.fn() } as unknown as TwilioService,
        configFor(),
        outbox,
      );

      await (service as any).recalculateBlastStatus("blast_sent");

      expect(outbox.append).toHaveBeenCalledTimes(1);
      expect(outbox.append).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({
          tenantId: "org_1",
          eventType: "messaging.blast.sent",
          aggregateId: "blast_sent",
          payload: { blastId: "blast_sent", tenantId: "org_1", recipientCount: 42 },
        }),
      );
    });

    it("does not re-emit messaging.blast.sent when the blast is already SENT", async () => {
      const outbox = { append: jest.fn().mockResolvedValue(undefined) };
      const prismaMock: any = {
        $transaction: (cb: any) => cb(prismaMock),
        blast: {
          findUnique: jest.fn().mockResolvedValue({
            id: "blast_sent",
            tenantId: "org_1",
            status: BlastStatus.SENT,
            completedAt: new Date("2026-05-01T00:00:00.000Z"),
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        blastRecipient: {
          count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const service = build(
        prismaMock,
        { sendMessage: jest.fn() } as unknown as TwilioService,
        configFor(),
        outbox,
      );

      await (service as any).recalculateBlastStatus("blast_sent");

      expect(outbox.append).not.toHaveBeenCalled();
      expect(prismaMock.blast.update).not.toHaveBeenCalled();
    });
  });

  describe("retryFailed bounding", () => {
    const retryPrisma = (failedCount: number) => {
      const failed = Array.from({ length: failedCount }, (_, index) => ({
        id: `failed_${index}`,
        phoneE164: `+1555111${String(index).padStart(4, "0")}`,
        renderedBody: "Retry me",
        metadata: {},
      }));
      const prismaMock: any = {
        $transaction: (cb: any) => cb(prismaMock),
        blast: {
          findUnique: jest.fn().mockResolvedValue({
            id: "blast_retry",
            tenantId: "org_1",
            status: BlastStatus.SENDING,
            completedAt: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        blastRecipient: {
          findMany: jest.fn().mockResolvedValueOnce(failed).mockResolvedValueOnce([]),
          count: jest.fn().mockResolvedValue(0),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      return prismaMock;
    };

    it("takes one send-batch-size page with a narrow select", async () => {
      const prismaMock = retryPrisma(3);
      const twilioMock = {
        sendMessage: jest.fn().mockResolvedValue({
          sid: "SM_RETRY",
          dateCreated: new Date().toISOString(),
          dateSent: new Date().toISOString(),
        }),
      } as unknown as TwilioService;
      const service = build(prismaMock, twilioMock, configFor({ BLAST_SEND_BATCH_SIZE: "3" }));

      const result = await service.retryFailed("blast_retry");

      const query = prismaMock.blastRecipient.findMany.mock.calls[0][0];
      expect(query.take).toBe(3);
      expect(query.orderBy).toEqual({ createdAt: "asc" });
      expect(query.select).toEqual({
        id: true,
        phoneE164: true,
        renderedBody: true,
        metadata: true,
      });
      expect(query.where).toEqual({ blastId: "blast_retry", status: BlastRecipientStatus.FAILED });
      expect(result).toEqual({ blastId: "blast_retry", retried: 3 });
    });

    it("clamps take to the send-batch-size ceiling", async () => {
      const prismaMock = retryPrisma(0);
      const service = build(
        prismaMock,
        { sendMessage: jest.fn() } as unknown as TwilioService,
        configFor({ BLAST_SEND_BATCH_SIZE: "100000" }),
      );

      await service.retryFailed("blast_retry");

      expect(prismaMock.blastRecipient.findMany.mock.calls[0][0].take).toBe(500);
    });

    it("stops the batch early once the wall-clock budget is spent, without re-enqueueing", async () => {
      const prismaMock = retryPrisma(3);
      let now = 0;
      const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);
      const twilioMock = {
        sendMessage: jest.fn().mockImplementation(async () => {
          // The first send burns the whole budget; the loop must not start a second.
          now = 9_999;
          return {
            sid: "SM_RETRY",
            dateCreated: new Date().toISOString(),
            dateSent: new Date().toISOString(),
          };
        }),
      } as unknown as TwilioService;
      const service = build(
        prismaMock,
        twilioMock,
        configFor({ BLAST_SEND_BATCH_SIZE: "3", BLAST_SEND_MAX_RUN_MS: "1000" }),
      );
      const warnSpy = jest.spyOn((service as any).logger, "warn").mockImplementation(() => {});

      const result = await service.retryFailed("blast_retry");

      expect(twilioMock.sendMessage).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ blastId: "blast_retry", retried: 1 });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Stopping blast retry batch early due to runtime budget"),
      );
      // Single batch per invocation – nothing schedules the remainder.
      expect(prismaMock.blastRecipient.findMany).toHaveBeenCalledTimes(2);
      nowSpy.mockRestore();
    });
  });
});
