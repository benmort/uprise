import { SeedService } from "./seed.service";
import {
  DEMO_KNOCKS,
  DEMO_KNOCK_TODAY_WINDOW_HOURS,
  DEMO_PHONE_CONTACT_COUNT,
  DEMO_SEARCHES,
  DEMO_SENDER_PHONE,
  DEMO_SHIFTS,
  DEMO_THREADS,
  DEMO_WALK_LIST,
  buildDemoContacts,
  demoPhone,
} from "./seed-data";

/**
 * Mocked-prisma spec for the demo seeder's inbox-thread writer and the matching teardown.
 *
 * A Proxy stands in for the client so a method on any model resolves to a jest.fn() — seedDemo()
 * touches a couple of dozen models and enumerating them adds nothing. Each test overrides just the
 * handful it asserts on.
 */
/** Shape the default return by method name, so callers that `.map()` a findMany don't blow up. */
function defaultFor(method: string) {
  if (method === "findMany" || method === "groupBy") return async () => [];
  if (method === "deleteMany" || method === "updateMany") return async () => ({ count: 0 });
  return async () => null;
}

function mockPrisma(overrides: Record<string, Record<string, unknown>> = {}) {
  const models = new Map<string, Record<string, jest.Mock>>();
  const calls: Record<string, jest.Mock> = {};
  const client: any = new Proxy(
    {
      $executeRawUnsafe: jest.fn(async () => 0),
      $transaction: jest.fn(async (fn: any) => (typeof fn === "function" ? fn(client) : undefined)),
    },
    {
      get(target: any, prop: string) {
        if (prop in target) return target[prop];
        if (!models.has(prop)) {
          const model = new Proxy({} as Record<string, jest.Mock>, {
            get(m: Record<string, jest.Mock>, method: string) {
              if (!m[method]) {
                const over = overrides[prop]?.[method];
                m[method] = jest.fn(typeof over === "function" ? (over as any) : defaultFor(method));
                calls[`${prop}.${method}`] = m[method];
              }
              return m[method];
            },
          });
          models.set(prop, model);
        }
        return models.get(prop);
      },
    },
  );
  return { client, calls };
}

function service(prisma: any) {
  // Constructor order is (config, prisma, engagement, canvassing); the config and the
  // engagement/canvassing collaborators aren't reached by the paths under test.
  return new SeedService({} as any, prisma, {} as any, {} as any);
}

const contacts = buildDemoContacts();
const contactIds = contacts.map((_, i) => `contact_${i}`);

/** seedThreads is private but it is the unit worth pinning — reach it by name. */
function seedThreads(svc: SeedService, organiserId = "organiser_1") {
  return (svc as unknown as {
    seedThreads: (t: string, ids: string[], c: typeof contacts, o: string) => Promise<void>;
  }).seedThreads("tenant_1", contactIds, contacts, organiserId);
}

describe("SeedService — inbox threads", () => {
  it("writes every message in every demo thread", async () => {
    const { client, calls } = mockPrisma();
    await seedThreads(service(client));

    const expectedIn = DEMO_THREADS.reduce((n, t) => n + t.messages.filter((m) => m.direction === "in").length, 0);
    const expectedOut = DEMO_THREADS.reduce((n, t) => n + t.messages.filter((m) => m.direction === "out").length, 0);
    expect(calls["inboundMessage.create"]).toHaveBeenCalledTimes(expectedIn);
    expect(calls["outboundMessage.create"]).toHaveBeenCalledTimes(expectedOut);
    expect(calls["conversationState.upsert"]).toHaveBeenCalledTimes(DEMO_THREADS.length);
  });

  it("keys messages on a deterministic demo sid so a re-seed is idempotent", async () => {
    const { client, calls } = mockPrisma();
    await seedThreads(service(client));
    const sids = [
      ...calls["inboundMessage.create"].mock.calls.map((c) => c[0].data.twilioMessageSid),
      ...calls["outboundMessage.create"].mock.calls.map((c) => c[0].data.twilioMessageSid),
    ];
    expect(new Set(sids).size).toBe(sids.length);
    for (const sid of sids) expect(sid).toMatch(/^demo:thread:\d+:\d+$/);
  });

  it("skips a message that already exists rather than duplicating the thread", async () => {
    const { client, calls } = mockPrisma({
      inboundMessage: { findUnique: async () => ({ id: "already" }) },
      outboundMessage: { findUnique: async () => ({ id: "already" }) },
    });
    await seedThreads(service(client));
    expect(calls["inboundMessage.create"]).toBeUndefined();
    expect(calls["outboundMessage.create"]).toBeUndefined();
    // The conversation row is still reconciled — unread/resolved may have moved on.
    expect(calls["conversationState.upsert"]).toHaveBeenCalledTimes(DEMO_THREADS.length);
  });

  it("routes each message between the contact and the demo sender", async () => {
    const { client, calls } = mockPrisma();
    await seedThreads(service(client));
    const first = DEMO_THREADS[0];
    const phone = contacts[first.contactIndex].phoneE164;

    const inbound = calls["inboundMessage.create"].mock.calls.map((c) => c[0].data);
    const mine = inbound.find((d) => d.fromPhone === phone);
    expect(mine).toMatchObject({ toPhone: DEMO_SENDER_PHONE, threadKey: phone });

    const outbound = calls["outboundMessage.create"].mock.calls.map((c) => c[0].data);
    expect(outbound.find((d) => d.toPhone === phone)).toMatchObject({ fromPhone: DEMO_SENDER_PHONE });
  });

  it("assigns an owner only to the claimed threads", async () => {
    const { client, calls } = mockPrisma();
    await seedThreads(service(client), "organiser_9");
    const states = calls["conversationState.upsert"].mock.calls.map((c) => c[0]);

    const claimedCount = DEMO_THREADS.filter((t) => t.claimed).length;
    const owned = states.filter((s) => s.create.ownerId === "organiser_9");
    expect(owned).toHaveLength(claimedCount);
    for (const s of owned) expect(s.create.claimedAt).toBeInstanceOf(Date);
    for (const s of states.filter((x) => x.create.ownerId === null)) expect(s.create.claimedAt).toBeNull();
  });

  it("carries unread and resolved through to the conversation row, and stamps lastMessageAt", async () => {
    const { client, calls } = mockPrisma();
    await seedThreads(service(client));
    const states = calls["conversationState.upsert"].mock.calls.map((c) => c[0]);
    for (const [i, thread] of DEMO_THREADS.entries()) {
      expect(states[i].create).toMatchObject({ unreadCount: thread.unread, resolved: thread.resolved });
      expect(states[i].update).toMatchObject({ unreadCount: thread.unread, resolved: thread.resolved });
      // Newest message in the thread wins, so the inbox sorts correctly.
      expect(states[i].create.lastMessageAt).toBeInstanceOf(Date);
    }
  });

  it("ignores a thread whose contact wasn't created", async () => {
    const { client, calls } = mockPrisma();
    const svc = service(client);
    await (svc as any).seedThreads("tenant_1", [], contacts, "organiser_1");
    expect(calls["conversationState.upsert"]).toBeUndefined();
  });
});

describe("SeedService — knock backdating", () => {
  /** backdateKnocks is private; it is the unit that keeps "doors today" alive, so pin it by name. */
  function backdate(svc: SeedService) {
    return (svc as unknown as { backdateKnocks: (t: string) => Promise<void> }).backdateKnocks("tenant_1");
  }

  it("re-stamps every seeded knock", async () => {
    const { client, calls } = mockPrisma();
    await backdate(service(client));
    expect(calls["doorKnock.updateMany"]).toHaveBeenCalledTimes(DEMO_KNOCKS.length);
  });

  it("writes createdAt, not just clientCapturedAt", async () => {
    // The dashboard tile counts DoorKnock.createdAt >= startOfToday(); setting only the capture
    // time would leave it reading zero, which is the bug this exists to prevent.
    const { client, calls } = mockPrisma();
    await backdate(service(client));
    for (const call of calls["doorKnock.updateMany"].mock.calls) {
      expect(call[0].data.createdAt).toBeInstanceOf(Date);
      expect(call[0].data.clientCapturedAt).toEqual(call[0].data.createdAt);
    }
  });

  it("targets each knock by its deterministic localId, so a re-run is idempotent", async () => {
    const { client, calls } = mockPrisma();
    await backdate(service(client));
    const ids = calls["doorKnock.updateMany"].mock.calls.map((c: any[]) => c[0].where.localId);
    expect(new Set(ids).size).toBe(DEMO_KNOCKS.length);
    for (const id of ids) expect(id).toMatch(/^demo:knock:\d+$/);
  });

  it("puts the whole recent cohort inside today and spreads the rest backwards", async () => {
    // Pinned to mid-morning, like the after-midnight case below, because this assertion is
    // only true for part of the day. Knocks outside the today cohort are dated `now - hoursAgo`,
    // so once more than DEMO_KNOCK_TODAY_WINDOW_HOURS of the day have elapsed the ones just
    // beyond the window also land inside today and the count overshoots. That is correct
    // behaviour — a knock 13 hours ago really did happen early today — but it made the test
    // pass every morning and fail every afternoon.
    jest.useFakeTimers();
    try {
      const midMorning = new Date();
      midMorning.setHours(9, 0, 0, 0);
      jest.setSystemTime(midMorning);

      const { client, calls } = mockPrisma();
      const before = Date.now();
      await backdate(service(client));
      const times = calls["doorKnock.updateMany"].mock.calls.map((c: any[]) => c[0].data.createdAt.getTime());
      const startOfToday = new Date(midMorning);
      startOfToday.setHours(0, 0, 0, 0);

      const todayCount = DEMO_KNOCKS.filter((k) => k.hoursAgo < DEMO_KNOCK_TODAY_WINDOW_HOURS).length;
      expect(times.filter((t: number) => t >= startOfToday.getTime()).length).toBe(todayCount);
      expect(Math.max(...times)).toBeLessThanOrEqual(before + 1000);
      // Several days of history behind it.
      expect(before - Math.min(...times)).toBeGreaterThan(5 * 86_400_000);
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps the today cohort inside today even when run just after midnight", async () => {
    // The regression: dating by `now - hoursAgo` puts every recent knock in YESTERDAY if the seed
    // runs early in the morning, so the tile reads 0 — exactly what this code prevents.
    jest.useFakeTimers();
    try {
      const justAfterMidnight = new Date();
      justAfterMidnight.setHours(0, 20, 0, 0);
      jest.setSystemTime(justAfterMidnight);

      const { client, calls } = mockPrisma();
      await backdate(service(client));
      const midnight = new Date(justAfterMidnight);
      midnight.setHours(0, 0, 0, 0);
      const times = calls["doorKnock.updateMany"].mock.calls.map((c: any[]) => c[0].data.createdAt.getTime());
      const todayCount = DEMO_KNOCKS.filter((k) => k.hoursAgo < DEMO_KNOCK_TODAY_WINDOW_HOURS).length;

      expect(times.filter((t: number) => t >= midnight.getTime()).length).toBe(todayCount);
      // ...and never dated into the future.
      expect(Math.max(...times)).toBeLessThanOrEqual(justAfterMidnight.getTime());
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("SeedService — dashboard surfaces", () => {
  function seedSurfaces(svc: SeedService) {
    return (svc as unknown as {
      seedDashboardSurfaces: (
        t: string,
        ids: string[],
        campaignId: string,
        turfId: string,
        volunteerId: string,
        organiserId: string,
      ) => Promise<void>;
    }).seedDashboardSurfaces("tenant_1", contactIds, "campaign_1", "turf_1", "vol_1", "org_1");
  }

  it("creates one saved search per fixture, as a v2 envelope", async () => {
    const { client, calls } = mockPrisma({
      audience: { create: async () => ({ id: "aud_1" }) },
      contactTag: { upsert: async () => ({ id: "tag_1" }) },
      event: { create: async () => ({ id: "evt_1" }) },
      shift: { create: async () => ({ id: "shift_1" }) },
      blast: { create: async () => ({ id: "blast_1" }) },
    });
    await seedSurfaces(service(client));

    expect(calls["audienceSegment.create"]).toHaveBeenCalledTimes(DEMO_SEARCHES.length);
    for (const call of calls["audienceSegment.create"].mock.calls) {
      const def = call[0].data.definition;
      expect(def.format).toBe(2);
      expect(def.filter.kind).toBe("all");
      expect(def.policy.fatigue).toBeDefined();
      expect(def.policy.isActive.predicate.kind).toBe("condition");
    }
  });

  it("fills the calendar and gives every shift a volunteer", async () => {
    const { client, calls } = mockPrisma({
      audience: { create: async () => ({ id: "aud_1" }) },
      contactTag: { upsert: async () => ({ id: "tag_1" }) },
      event: { create: async () => ({ id: "evt_1" }) },
      shift: { create: async () => ({ id: "shift_1" }) },
      blast: { create: async () => ({ id: "blast_1" }) },
    });
    await seedSurfaces(service(client));

    expect(calls["shift.create"]).toHaveBeenCalledTimes(DEMO_SHIFTS.length);
    expect(calls["shiftAssignment.create"]).toHaveBeenCalledTimes(DEMO_SHIFTS.length);
    expect(calls["event.create"]).toHaveBeenCalled();
    expect(calls["suppression.create"]).toHaveBeenCalled();
    for (const call of calls["event.create"].mock.calls) {
      expect(call[0].data.endsAt.getTime()).toBeGreaterThan(call[0].data.startsAt.getTime());
    }
  });

  it("never writes an audience member without a phone", async () => {
    // AudienceContact.phoneE164 is required, so the email-only tier must be skipped, not coerced.
    // `count` needs an explicit 0 — the Proxy's default returns null, which reads as "already
    // populated" and would skip the member writes this test is here to inspect.
    const { client, calls } = mockPrisma({
      audience: { create: async () => ({ id: "aud_1" }) },
      audienceContact: { count: async () => 0 },
      contactTag: { upsert: async () => ({ id: "tag_1" }) },
      event: { create: async () => ({ id: "evt_1" }) },
      shift: { create: async () => ({ id: "shift_1" }) },
      blast: { create: async () => ({ id: "blast_1" }) },
    });
    await seedSurfaces(service(client));
    for (const call of calls["audienceContact.create"].mock.calls) {
      expect(call[0].data.phoneE164).toBeTruthy();
    }
    for (const call of calls["blastRecipient.create"].mock.calls) {
      expect(call[0].data.phoneE164).toBeTruthy();
    }
  });

  it("skips a surface that already exists rather than duplicating it", async () => {
    const { client, calls } = mockPrisma({
      audience: { findFirst: async () => ({ id: "aud_1" }), create: async () => ({ id: "aud_1" }) },
      audienceSegment: { findFirst: async () => ({ id: "seg_1" }) },
      event: { findFirst: async () => ({ id: "evt_1" }) },
      shift: { findFirst: async () => ({ id: "shift_1" }) },
      blast: { findFirst: async () => ({ id: "blast_1" }) },
      suppression: { findFirst: async () => ({ id: "sup_1" }) },
      contactTag: { upsert: async () => ({ id: "tag_1" }) },
      contactTagAssignment: { findFirst: async () => ({ id: "cta_1" }) },
      audienceContact: { count: async () => 5 },
    });
    await seedSurfaces(service(client));

    expect(calls["audienceSegment.create"]).toBeUndefined();
    expect(calls["event.create"]).toBeUndefined();
    expect(calls["shift.create"]).toBeUndefined();
    expect(calls["blast.create"]).toBeUndefined();
    expect(calls["suppression.create"]).toBeUndefined();
    expect(calls["audienceContact.create"]).toBeUndefined();
  });
});

describe("SeedService — clearDemo", () => {
  it("removes the seeded messages and conversation rows", async () => {
    const { client, calls } = mockPrisma({ tenant: { upsert: async () => ({ id: "tenant_1" }) } });
    await service(client).clearDemo();

    expect(calls["inboundMessage.deleteMany"]).toHaveBeenCalledWith({
      where: { tenantId: "tenant_1", twilioMessageSid: { startsWith: "demo:thread:" } },
    });
    expect(calls["outboundMessage.deleteMany"]).toHaveBeenCalledWith({
      where: { tenantId: "tenant_1", twilioMessageSid: { startsWith: "demo:thread:" } },
    });

    const stateCall = calls["conversationState.deleteMany"].mock.calls[0][0];
    expect(stateCall.where.tenantId).toBe("tenant_1");
    // Every PHONE-bearing demo contact plus the sender — otherwise a phone-only thread survives
    // the clear. The email-only tier has no number and so has no conversation row to remove.
    expect(stateCall.where.contactPhone.in).toContain(demoPhone(0));
    expect(stateCall.where.contactPhone.in).toContain(DEMO_SENDER_PHONE);
    expect(stateCall.where.contactPhone.in).toHaveLength(DEMO_PHONE_CONTACT_COUNT + 1);
    expect(stateCall.where.contactPhone.in).not.toContain(undefined);
  });

  it("deletes messages before the contacts they point at", async () => {
    const { client } = mockPrisma({ tenant: { upsert: async () => ({ id: "tenant_1" }) } });
    const order: string[] = [];
    const svc = service(client);
    for (const key of ["inboundMessage", "outboundMessage", "conversationState", "contact"]) {
      (client as any)[key].deleteMany.mockImplementation(async () => {
        order.push(key);
        return { count: 0 };
      });
    }
    await svc.clearDemo();
    // The message → contact FKs are SetNull, so a contact deleted first would strand the thread.
    expect(order.indexOf("inboundMessage")).toBeLessThan(order.indexOf("contact"));
    expect(order.indexOf("outboundMessage")).toBeLessThan(order.indexOf("contact"));
    expect(order.indexOf("conversationState")).toBeLessThan(order.indexOf("contact"));
  });

  it("removes the walk list, which used to survive a clear and pin the fixture size", async () => {
    // createWalkList is guarded by findFirst-on-name, so a surviving list is never rebuilt — the
    // fixture stayed at whatever size it had when the list was first created.
    const { client, calls } = mockPrisma({ tenant: { upsert: async () => ({ id: "tenant_1" }) } });
    await service(client).clearDemo();
    expect(calls["walkList.deleteMany"]).toHaveBeenCalledWith({
      where: { tenantId: "tenant_1", name: DEMO_WALK_LIST.name },
    });
    expect(calls["turfAssignment.deleteMany"]).toHaveBeenCalled();
  });

  it("removes every surface the seeder now writes", async () => {
    const { client, calls } = mockPrisma({ tenant: { upsert: async () => ({ id: "tenant_1" }) } });
    await service(client).clearDemo();
    for (const model of [
      "shift",
      "shiftAssignment",
      "event",
      "eventRsvp",
      "contactTag",
      "contactTagAssignment",
      "suppression",
      "audienceSegment",
    ]) {
      expect(calls[`${model}.deleteMany`]).toHaveBeenCalled();
    }
  });

  it("deletes shift seats and RSVPs before the shifts and events they hang off", async () => {
    const { client } = mockPrisma({ tenant: { upsert: async () => ({ id: "tenant_1" }) } });
    const order: string[] = [];
    for (const key of ["shiftAssignment", "shift", "eventRsvp", "event"]) {
      (client as any)[key].deleteMany.mockImplementation(async () => {
        order.push(key);
        return { count: 0 };
      });
    }
    await service(client).clearDemo();
    expect(order.indexOf("shiftAssignment")).toBeLessThan(order.indexOf("shift"));
    expect(order.indexOf("eventRsvp")).toBeLessThan(order.indexOf("event"));
  });
});
