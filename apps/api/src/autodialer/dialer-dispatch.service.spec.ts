import { DialerCampaignStatus } from "@uprise/db";
import { DialerDispatchService } from "./dialer-dispatch.service";
import { QUEUE_JOB_TYPES, QUEUE_NAMES } from "../common/queue/queue.constants";

/**
 * The dial engine's producer + tick. Two named regressions live here:
 *
 *  - the source's inverted pacing condition (autodialer/dialer.ts:95) – it
 *    returned early exactly when the period HAD elapsed, so campaigns dialled
 *    on every cron beat and never respected dialerPeriodMinutes;
 *  - the windowed candidate walk – the tick reads members in slices of
 *    batchSize × 4 rather than materialising the whole audience. A bare `take`
 *    would be WRONG here: members come back in a stable order, so the same
 *    already-excluded head would be re-served every tick and the zero-candidate
 *    auto-complete would fire falsely on a campaign that still has numbers to
 *    ring. The refill/exhaustion tests below are what pin that shut.
 */

// A fixed "now" inside the default 09:00–20:00 window for Australia/Sydney:
// 2026-08-04T03:00:00Z = 13:00 AEST.
const NOW = new Date("2026-08-04T03:00:00.000Z");

/** Index-addressable valid AU E.164 numbers – phone(0) … phone(n). */
const phone = (i: number) => `+6149157${String(i).padStart(4, "0")}`;

const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

type AttemptFixture = { phoneE164: string; outcome: string; count: number; createdAt: Date };

function makePrisma() {
  const prisma: any = {
    dialerCampaign: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    dialerAttempt: {
      // NOTE: no `findMany` – the tick derives the attempt cap, the no-call
      // window AND the terminal-outcome exclusion from the ONE grouped read.
      // Reintroducing a second full scan would blow up against this mock.
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `att-${data.phoneE164}`, ...data }),
      ),
    },
    contact: { findMany: jest.fn().mockResolvedValue([]) },
    contactConsent: { findMany: jest.fn().mockResolvedValue([]) },
    suppression: { findMany: jest.fn().mockResolvedValue([]) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ settings: null }) },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  return prisma;
}

/**
 * Install window-aware exclusion reads: each ledger fixture is filtered to the
 * `phoneE164: { in: [...] }` the tick actually asked for, exactly as Postgres
 * would. Without this the mock would hand every window the whole ledger and
 * the refill tests would prove nothing about scoping.
 */
function seedLedgers(
  prisma: any,
  fixtures: { optedOut?: string[]; suppressed?: string[]; attempts?: AttemptFixture[] },
) {
  const asked = (where: any): string[] => where?.phoneE164?.in ?? [];
  prisma.contactConsent.findMany.mockImplementation(async ({ where }: any) =>
    (fixtures.optedOut ?? []).filter((p) => asked(where).includes(p)).map((phoneE164) => ({ phoneE164 })),
  );
  prisma.suppression.findMany.mockImplementation(async ({ where }: any) =>
    (fixtures.suppressed ?? []).filter((p) => asked(where).includes(p)).map((phoneE164) => ({ phoneE164 })),
  );
  prisma.dialerAttempt.groupBy.mockImplementation(async ({ where }: any) =>
    (fixtures.attempts ?? [])
      .filter((a) => asked(where).includes(a.phoneE164))
      .map((a) => ({
        phoneE164: a.phoneE164,
        outcome: a.outcome,
        _count: { _all: a.count },
        _max: { createdAt: a.createdAt },
      })),
  );
}

/** Every phone the tick asked about, window by window, in walk order. */
const windowsAsked = (prisma: any): string[][] =>
  prisma.dialerAttempt.groupBy.mock.calls.map((c: any[]) => c[0].where.phoneE164.in);

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

function makeService(
  prisma: any,
  over: { members?: Array<{ contactId?: string; phoneE164: string }>; contactIds?: string[] } = {},
) {
  const queue = { enqueue: jest.fn() };
  const order = over.contactIds
    ? { kind: "contactIds", contactIds: over.contactIds }
    : { kind: "members", members: over.members ?? [] };
  const recipients = {
    resolveOrderedMembers: jest.fn().mockResolvedValue(order),
    // Present but unused by the tick – the blast path still calls it, and a
    // tick that reached for it would be re-materialising the whole audience.
    resolvePhoneRecipients: jest.fn().mockResolvedValue([]),
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
      const { service, queue } = makeService(prisma, { members: [{ phoneE164: phone(1) }] });

      const out = await service.runTick(payload, NOW);

      expect(out.claimed).toBe(false);
      expect(out.dialled).toBe(0);
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it("dials audience members, creating attempts with incremented attemptNo and one place job each", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());
      seedLedgers(prisma, {
        attempts: [{ phoneE164: phone(2), outcome: "NO_ANSWER", count: 1, createdAt: hoursAgo(48) }],
      });
      const { service, queue } = makeService(prisma, {
        members: [
          { contactId: "c1", phoneE164: phone(1) },
          { contactId: "c2", phoneE164: phone(2) },
        ],
      });

      const out = await service.runTick(payload, NOW);

      expect(out.dialled).toBe(2);
      const created = prisma.dialerAttempt.create.mock.calls.map((c: any[]) => c[0].data);
      expect(created[0]).toMatchObject({ phoneE164: phone(1), attemptNo: 1 });
      expect(created[1]).toMatchObject({ phoneE164: phone(2), attemptNo: 2 });
      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      expect(queue.enqueue.mock.calls[0][0].type).toBe(QUEUE_JOB_TYPES.DIALER_PLACE_CALL);
    });

    it("excludes VOICE opt-outs, suppressions, invalid numbers, capped and recently-dialled phones — and counts each skip", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());
      seedLedgers(prisma, {
        optedOut: [phone(10)],
        suppressed: [phone(11)],
        attempts: [
          // capped: already at maxCallAttempts
          { phoneE164: phone(12), outcome: "NO_ANSWER", count: 3, createdAt: hoursAgo(48) },
          // recent: inside the 24h no-call window
          { phoneE164: phone(13), outcome: "BUSY", count: 1, createdAt: hoursAgo(1) },
        ],
      });
      const { service, queue } = makeService(prisma, {
        members: [
          { phoneE164: phone(10) }, // opted out
          { phoneE164: phone(11) }, // suppressed
          { phoneE164: "0491570014" }, // invalid (not E.164 AU)
          { phoneE164: phone(12) }, // capped
          { phoneE164: phone(13) }, // recent
          { phoneE164: phone(15) }, // dialable
        ],
      });

      const out = await service.runTick(payload, NOW);

      expect(out.skipped).toEqual({ optedOut: 1, suppressed: 1, invalid: 1, capped: 1, recent: 1 });
      expect(out.dialled).toBe(1);
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    });

    it("never dials a phone with a terminal ANSWERED/OPTED_OUT outcome again, even under the attempt cap and outside the no-call window", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());
      seedLedgers(prisma, {
        attempts: [
          // Two attempts (cap is 3) and both long outside the 24h window – only
          // the terminal ANSWERED row keeps this number off the dial list.
          { phoneE164: phone(20), outcome: "NO_ANSWER", count: 1, createdAt: hoursAgo(72) },
          { phoneE164: phone(20), outcome: "ANSWERED", count: 1, createdAt: hoursAgo(48) },
          { phoneE164: phone(21), outcome: "OPTED_OUT", count: 1, createdAt: hoursAgo(48) },
        ],
      });
      const { service } = makeService(prisma, {
        members: [{ phoneE164: phone(20) }, { phoneE164: phone(21) }],
      });

      const out = await service.runTick(payload, NOW);

      expect(out.dialled).toBe(0);
      expect(out.skipped.capped).toBe(2);
    });

    it("derives the attempt cap by SUMMING the grouped counts and the no-call window from the MAX createdAt across outcomes", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());
      seedLedgers(prisma, {
        attempts: [
          // capped: 1 + 1 + 1 = 3 rows across three outcomes, all long past.
          { phoneE164: phone(30), outcome: "NO_ANSWER", count: 1, createdAt: hoursAgo(96) },
          { phoneE164: phone(30), outcome: "BUSY", count: 1, createdAt: hoursAgo(72) },
          { phoneE164: phone(30), outcome: "FAILED", count: 1, createdAt: hoursAgo(48) },
          // recent: only 2 of 3 attempts used, but the LATEST of the two groups
          // is 1h old – the max, not the first row, decides.
          { phoneE164: phone(31), outcome: "NO_ANSWER", count: 1, createdAt: hoursAgo(96) },
          { phoneE164: phone(31), outcome: "BUSY", count: 1, createdAt: hoursAgo(1) },
          // dialable: 2 attempts, newest 48h ago → attemptNo 3.
          { phoneE164: phone(32), outcome: "NO_ANSWER", count: 1, createdAt: hoursAgo(96) },
          { phoneE164: phone(32), outcome: "MACHINE", count: 1, createdAt: hoursAgo(48) },
        ],
      });
      const { service } = makeService(prisma, {
        members: [{ phoneE164: phone(30) }, { phoneE164: phone(31) }, { phoneE164: phone(32) }],
      });

      const out = await service.runTick(payload, NOW);

      expect(out.skipped).toMatchObject({ capped: 1, recent: 1 });
      expect(out.dialled).toBe(1);
      expect(prisma.dialerAttempt.create.mock.calls[0][0].data).toMatchObject({
        phoneE164: phone(32),
        attemptNo: 3,
      });
    });

    it("caps a tick at batchSize", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ batchSize: 2 }));
      const members = Array.from({ length: 5 }, (_, i) => ({ phoneE164: phone(100 + i) }));
      const { service } = makeService(prisma, { members });

      expect((await service.runTick(payload, NOW)).dialled).toBe(2);
    });

    describe("the windowed walk", () => {
      it("reads members in windows of batchSize × 4, scoping every exclusion read to that window's phones", async () => {
        const prisma = makePrisma();
        prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ batchSize: 2 }));
        // windowSize = 2 × 4 = 8 → members 0–7, then 8–9.
        const members = Array.from({ length: 10 }, (_, i) => ({ phoneE164: phone(i) }));
        // Every member of window one is excluded, so the walk MUST refill.
        seedLedgers(prisma, {
          optedOut: [phone(0), phone(1)],
          suppressed: [phone(2), phone(3)],
          attempts: [
            { phoneE164: phone(4), outcome: "NO_ANSWER", count: 3, createdAt: hoursAgo(48) },
            { phoneE164: phone(5), outcome: "BUSY", count: 3, createdAt: hoursAgo(48) },
            { phoneE164: phone(6), outcome: "ANSWERED", count: 1, createdAt: hoursAgo(48) },
            { phoneE164: phone(7), outcome: "OPTED_OUT", count: 1, createdAt: hoursAgo(48) },
          ],
        });
        const { service } = makeService(prisma, { members });

        const out = await service.runTick(payload, NOW);

        expect(windowsAsked(prisma)).toEqual([
          [phone(0), phone(1), phone(2), phone(3), phone(4), phone(5), phone(6), phone(7)],
          [phone(8), phone(9)],
        ]);
        // Never the whole ledger: the consent + suppression reads are scoped too.
        for (const call of prisma.contactConsent.findMany.mock.calls) {
          expect(call[0].where.phoneE164.in.length).toBeLessThanOrEqual(8);
        }
        expect(prisma.suppression.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ phoneE164: expect.objectContaining({ not: null }) }),
          }),
        );
        expect(out.dialled).toBe(2);
        expect(out.skipped).toEqual({ optedOut: 2, suppressed: 2, invalid: 0, capped: 4, recent: 0 });
        const dialled = prisma.dialerAttempt.create.mock.calls.map((c: any[]) => c[0].data.phoneE164);
        expect(dialled).toEqual([phone(8), phone(9)]);
      });

      it("stops refilling the moment batchSize candidates exist – later windows are never read", async () => {
        const prisma = makePrisma();
        prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ batchSize: 1 }));
        // windowSize = 4; window one already yields the one candidate needed.
        const members = Array.from({ length: 12 }, (_, i) => ({ phoneE164: phone(i) }));
        const { service } = makeService(prisma, { members });

        const out = await service.runTick(payload, NOW);

        expect(out.dialled).toBe(1);
        expect(windowsAsked(prisma)).toHaveLength(1);
      });

      it("preserves member order across the window boundary and re-imposes it on out-of-order Contact rows", async () => {
        const prisma = makePrisma();
        prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ batchSize: 2 }));
        // A dynamic-segment audience: identity is contact ids in v2 hash order,
        // and each window hydrates its own slice against the Contact spine.
        const contactIds = Array.from({ length: 10 }, (_, i) => `c${i}`);
        prisma.contact.findMany.mockImplementation(async ({ where }: any) => {
          const ids: string[] = where.id.in;
          // Postgres returns `id IN (...)` rows in whatever order it likes –
          // reverse them so any test that passes is proving the re-ordering.
          return ids
            .filter((id) => id !== "c3") // c3 has no phone → drops out entirely
            .map((id) => ({ id, phoneE164: phone(Number(id.slice(1))) }))
            .reverse();
        });
        // Window one (c0–c7) yields only c7; the walk crosses into window two.
        seedLedgers(prisma, {
          optedOut: [phone(0), phone(1), phone(2)],
          suppressed: [phone(4), phone(5), phone(6)],
        });
        const { service } = makeService(prisma, { contactIds });

        const out = await service.runTick(payload, NOW);

        expect(prisma.contact.findMany.mock.calls.map((c: any[]) => c[0].where.id.in)).toEqual([
          ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"],
          ["c8", "c9"],
        ]);
        expect(out.dialled).toBe(2);
        const created = prisma.dialerAttempt.create.mock.calls.map((c: any[]) => c[0].data);
        expect(created.map((d: any) => d.phoneE164)).toEqual([phone(7), phone(8)]);
        expect(created.map((d: any) => d.contactId)).toEqual(["c7", "c8"]);
        // c3 had no phone, so it is not a skip – it was never a member.
        expect(out.skipped).toEqual({ optedOut: 3, suppressed: 3, invalid: 0, capped: 0, recent: 0 });
      });
    });

    describe("auto-complete", () => {
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

      it("REGRESSION (windowed walk): does NOT auto-complete when an EXCLUDED first window hides a later window that still has candidates", async () => {
        const prisma = makePrisma();
        prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ batchSize: 1 }));
        prisma.dialerAttempt.count.mockResolvedValue(0); // nothing pending – the trap is armed
        // windowSize = 4. A naive `take(batchSize × k)` would see four excluded
        // members, conclude the audience is spent and COMPLETE the campaign,
        // stranding phone(4) for ever.
        const members = Array.from({ length: 5 }, (_, i) => ({ phoneE164: phone(i) }));
        seedLedgers(prisma, { optedOut: [phone(0), phone(1), phone(2), phone(3)] });
        const { service, autodialer } = makeService(prisma, { members });

        const out = await service.runTick(payload, NOW);

        expect(autodialer.complete).not.toHaveBeenCalled();
        expect(out.completed).toBe(false);
        expect(prisma.dialerAttempt.count).not.toHaveBeenCalled(); // never even asked
        expect(out.dialled).toBe(1);
        expect(prisma.dialerAttempt.create.mock.calls[0][0].data.phoneE164).toBe(phone(4));
      });

      it("auto-completes only AFTER the walk exhausts every window with zero candidates", async () => {
        const prisma = makePrisma();
        prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ batchSize: 1 }));
        prisma.dialerAttempt.count.mockResolvedValue(0);
        // windowSize = 4 over 10 members → three windows, all excluded.
        const members = Array.from({ length: 10 }, (_, i) => ({ phoneE164: phone(i) }));
        seedLedgers(prisma, { optedOut: members.map((m) => m.phoneE164) });
        const { service, autodialer } = makeService(prisma, { members });

        const out = await service.runTick(payload, NOW);

        expect(windowsAsked(prisma)).toHaveLength(3); // every member was considered
        expect(out.skipped.optedOut).toBe(10);
        expect(out.completed).toBe(true);
        expect(autodialer.complete).toHaveBeenCalledTimes(1);
      });

      it("survives a failing auto-complete without throwing the tick", async () => {
        const prisma = makePrisma();
        prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());
        const { service, autodialer } = makeService(prisma, { members: [] });
        autodialer.complete.mockRejectedValue(new Error("FSM said no"));

        const out = await service.runTick(payload, NOW);

        expect(out.completed).toBe(true);
      });
    });

    it("re-checks the calling window on the worker side (a queued tick can cross the edge)", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ dailyFinish: "10:00" })); // 13:00 AEST is past it
      const { service, queue } = makeService(prisma, { members: [{ phoneE164: phone(1) }] });

      const out = await service.runTick(payload, NOW);

      expect(out.claimed).toBe(false);
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it("no-ops for a campaign that is not ACTIVE or has no audience", async () => {
      const prisma = makePrisma();
      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ status: DialerCampaignStatus.PAUSED }));
      const { service, recipients } = makeService(prisma);

      expect((await service.runTick(payload, NOW)).claimed).toBe(false);

      prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ audienceId: null }));
      expect((await service.runTick(payload, NOW)).claimed).toBe(false);
      expect(recipients.resolveOrderedMembers).not.toHaveBeenCalled();
    });
  });
});
