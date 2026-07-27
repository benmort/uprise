import { SeedService } from "./seed.service";
import { DEMO_SENDER_PHONE, DEMO_THREADS, buildDemoContacts, demoPhone } from "./seed-data";

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
    // Every demo contact plus the sender — otherwise a phone-only thread survives the clear.
    expect(stateCall.where.contactPhone.in).toContain(demoPhone(0));
    expect(stateCall.where.contactPhone.in).toContain(DEMO_SENDER_PHONE);
    expect(stateCall.where.contactPhone.in).toHaveLength(contacts.length + 1);
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
});
