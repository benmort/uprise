import { DialerCampaignStatus } from "@uprise/db";
import { DialerDispatchService } from "./dialer-dispatch.service";
import { QUEUE_JOB_TYPES, QUEUE_NAMES } from "../common/queue/queue.constants";

/**
 * The dial engine's producer + tick. The named regression here is the source's
 * inverted pacing condition (autodialer/dialer.ts:95): it returned early exactly
 * when the period HAD elapsed, so campaigns dialled on every cron beat and never
 * respected dialerPeriodMinutes.
 */

// A fixed "now" inside the default 09:00–20:00 window for Australia/Sydney:
// 2026-08-04T03:00:00Z = 13:00 AEST.
const NOW = new Date("2026-08-04T03:00:00.000Z");

function makePrisma() {
  const prisma: any = {
    dialerCampaign: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    dialerAttempt: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `att-${data.phoneE164}`, ...data }),
      ),
    },
    contactConsent: { findMany: jest.fn().mockResolvedValue([]) },
    suppression: { findMany: jest.fn().mockResolvedValue([]) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ settings: null }) },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  return prisma;
}

const campaign = (over: Record<string, unknown> = {}) => ({
  id: "dc1",
  tenantId: "t1",
  status: DialerCampaignStatus.ACTIVE,
  outboundOnly: true,
  audienceId: "aud1",
  dailyStart: "09:00",
  dailyFinish: "20:00",
  dialerPeriodMinutes: 5,
  noCallWindowHours: 24,
  maxCallAttempts: 3,
  batchSize: 20,
  defaultLanguage: "en",
  lastDialedAt: null,
  ...over,
});

function makeService(prisma: any, over: { members?: Array<{ contactId?: string; phoneE164: string }> } = {}) {
  const queue = { enqueue: jest.fn() };
  const recipients = {
    resolvePhoneRecipients: jest.fn().mockResolvedValue(over.members ?? []),
  } as any;
  const autodialer = { complete: jest.fn().mockResolvedValue(undefined) } as any;
  const flags = { isEnabled: jest.fn().mockResolvedValue(true) } as any;
  const service = new DialerDispatchService(prisma, recipients, autodialer, queue as any, flags);
  return { service, queue, recipients, autodialer, flags };
}

describe("DialerDispatchService", () => {
  describe("dispatchDue (pacing)", () => {
    it("enqueues a tick for a campaign that has never been dialled", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findMany.mockResolvedValue([campaign()]);
      const { service, queue } = makeService(prisma);

      const out = await service.dispatchDue(NOW);

      expect(out.enqueued).toBe(1);
      expect(queue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          queue: QUEUE_NAMES.DIALER_DISPATCH,
          type: QUEUE_JOB_TYPES.DIALER_CAMPAIGN_TICK,
        }),
      );
    });

    it("REGRESSION (source dialer.ts:95, inverted pacing): a campaign dialled less than dialerPeriodMinutes ago is NOT due; one dialled longer ago IS", async () => {
      const prisma = makePrisma();
      const recent = campaign({ id: "recent", lastDialedAt: new Date(NOW.getTime() - 2 * 60_000) });
      const stale = campaign({ id: "stale", lastDialedAt: new Date(NOW.getTime() - 10 * 60_000) });
      prisma.dialerCampaign.findMany.mockResolvedValue([recent, stale]);
      const { service, queue } = makeService(prisma);

      const out = await service.dispatchDue(NOW);

      expect(out.enqueued).toBe(1);
      const ids = queue.enqueue.mock.calls.map((c: any[]) => c[0].payload.campaignId);
      expect(ids).toEqual(["stale"]);
    });

    it("skips campaigns outside the tenant's calling window", async () => {
      const prisma = makePrisma();
      // 13:00 AEST is outside a 14:00–20:00 window.
      prisma.dialerCampaign.findMany.mockResolvedValue([campaign({ dailyStart: "14:00" })]);
      const { service, queue } = makeService(prisma);

      expect((await service.dispatchDue(NOW)).enqueued).toBe(0);
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it("skips tenants whose FEATURE_AUTODIALER_ENABLED flag is off", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findMany.mockResolvedValue([campaign()]);
      const { service, queue, flags } = makeService(prisma);
      flags.isEnabled.mockResolvedValue(false);

      expect((await service.dispatchDue(NOW)).enqueued).toBe(0);
      expect(queue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("runTick", () => {
    const payload = { campaignId: "dc1", tenantId: "t1" };

    it("claims by CAS on lastDialedAt and no-ops when the claim is lost", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());
      prisma.dialerCampaign.updateMany.mockResolvedValue({ count: 0 }); // raced and lost
      const { service, queue } = makeService(prisma, { members: [{ phoneE164: "+61491570006" }] });

      const out = await service.runTick(payload, NOW);

      expect(out.claimed).toBe(false);
      expect(out.dialled).toBe(0);
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it("dials audience members, creating attempts with incremented attemptNo and one place job each", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());
      prisma.dialerAttempt.groupBy.mockResolvedValue([
        { phoneE164: "+61491570002", _count: { _all: 1 }, _max: { createdAt: new Date(NOW.getTime() - 48 * 3_600_000) } },
      ]);
      const { service, queue } = makeService(prisma, {
        members: [
          { contactId: "c1", phoneE164: "+61491570001" },
          { contactId: "c2", phoneE164: "+61491570002" },
        ],
      });

      const out = await service.runTick(payload, NOW);

      expect(out.dialled).toBe(2);
      const created = prisma.dialerAttempt.create.mock.calls.map((c: any[]) => c[0].data);
      expect(created[0]).toMatchObject({ phoneE164: "+61491570001", attemptNo: 1 });
      expect(created[1]).toMatchObject({ phoneE164: "+61491570002", attemptNo: 2 });
      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      expect(queue.enqueue.mock.calls[0][0].type).toBe(QUEUE_JOB_TYPES.DIALER_PLACE_CALL);
    });

    it("excludes VOICE opt-outs, suppressions, invalid numbers, capped and recently-dialled phones — and counts each skip", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());
      prisma.contactConsent.findMany.mockResolvedValue([{ phoneE164: "+61491570010" }]);
      prisma.suppression.findMany.mockResolvedValue([{ phoneE164: "+61491570011" }]);
      prisma.dialerAttempt.groupBy.mockResolvedValue([
        // capped: already at maxCallAttempts
        { phoneE164: "+61491570012", _count: { _all: 3 }, _max: { createdAt: new Date(NOW.getTime() - 48 * 3_600_000) } },
        // recent: inside the 24h no-call window
        { phoneE164: "+61491570013", _count: { _all: 1 }, _max: { createdAt: new Date(NOW.getTime() - 3_600_000) } },
      ]);
      const { service, queue } = makeService(prisma, {
        members: [
          { phoneE164: "+61491570010" }, // opted out
          { phoneE164: "+61491570011" }, // suppressed
          { phoneE164: "0491570014" }, // invalid (not E.164 AU)
          { phoneE164: "+61491570012" }, // capped
          { phoneE164: "+61491570013" }, // recent
          { phoneE164: "+61491570015" }, // dialable
        ],
      });

      const out = await service.runTick(payload, NOW);

      expect(out.skipped).toEqual({ optedOut: 1, suppressed: 1, invalid: 1, capped: 1, recent: 1 });
      expect(out.dialled).toBe(1);
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    });

    it("never dials a phone with a terminal ANSWERED/OPTED_OUT outcome again", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());
      prisma.dialerAttempt.findMany.mockResolvedValue([{ phoneE164: "+61491570020" }]);
      const { service } = makeService(prisma, { members: [{ phoneE164: "+61491570020" }] });

      const out = await service.runTick(payload, NOW);

      expect(out.dialled).toBe(0);
      expect(out.skipped.capped).toBe(1);
    });

    it("caps a tick at batchSize", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ batchSize: 2 }));
      const members = Array.from({ length: 5 }, (_, i) => ({ phoneE164: `+6149157010${i}` }));
      const { service } = makeService(prisma, { members });

      expect((await service.runTick(payload, NOW)).dialled).toBe(2);
    });

    it("auto-completes through the FSM path when nothing is left to dial and nothing is pending", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());
      prisma.dialerAttempt.count.mockResolvedValue(0);
      const { service, autodialer } = makeService(prisma, { members: [] });

      const out = await service.runTick(payload, NOW);

      expect(out.completed).toBe(true);
      expect(autodialer.complete).toHaveBeenCalledWith("t1", "dc1");
    });

    it("does NOT auto-complete while attempts are still pending", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());
      prisma.dialerAttempt.count.mockResolvedValue(3);
      const { service, autodialer } = makeService(prisma, { members: [] });

      const out = await service.runTick(payload, NOW);

      expect(out.completed).toBe(false);
      expect(autodialer.complete).not.toHaveBeenCalled();
    });

    it("re-checks the calling window on the worker side (a queued tick can cross the edge)", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ dailyFinish: "10:00" })); // 13:00 AEST is past it
      const { service, queue } = makeService(prisma, { members: [{ phoneE164: "+61491570001" }] });

      const out = await service.runTick(payload, NOW);

      expect(out.claimed).toBe(false);
      expect(queue.enqueue).not.toHaveBeenCalled();
    });
  });
});
