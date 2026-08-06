import { UnrecoverableError } from "bullmq";
import { Prisma } from "@uprise/db";
import { CrmPushService } from "./crm-push.service";
import { IntegrationAuthError } from "./integration.errors";
import { CredentialDecryptionError } from "./credential-crypto.service";

/**
 * The push pipeline's invariants, each pinned by a test (see the data-sync plan):
 *   I1 at-most-once per (connection, event) under replay/retry
 *   I2 nation-scoped identity — never a cross-nation write
 *   I7 loop safety — an imported tag never echoes back
 *   I8 auth failure costs O(1) — circuit breaker, not retry churn
 *   I9 every PENDING row eventually gets a job — the sweep
 */
describe("CrmPushService", () => {
  const envelope = (over: Record<string, unknown> = {}) => ({
    id: "evt1",
    eventType: "canvass.disposition.set",
    tenantId: "org1",
    aggregateId: "disp1",
    payload: { contactId: "c1" },
    metadata: {},
    occurredAt: new Date().toISOString(),
    ...over,
  });

  const activeConnection = (settings: Record<string, unknown> = {}) => ({
    id: "conn1",
    type: "NATION_BUILDER",
    status: "ACTIVE",
    encryptedCredential: "enc",
    settings: { baseUrl: "https://riverside.nationbuilder.com", ...settings },
    externalGroup: "riverside",
  });

  const pushOnSettings = { dataSync: { push: { enabled: true } } };

  const baseDelivery = (over: Record<string, unknown> = {}) => ({
    id: "d1",
    tenantId: "org1",
    connectionId: "conn1",
    eventId: "evt1",
    eventType: "canvass.disposition.set",
    stream: "disposition",
    contactId: "c1",
    externalPersonId: null,
    status: "PENDING",
    attempts: 0,
    requestSummary: null,
    responseSummary: null,
    connection: activeConnection(pushOnSettings),
    ...over,
  });

  function build(opts: { flagOn?: boolean } = {}) {
    const prisma: any = {
      integrationConnection: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      integrationPushDelivery: {
        create: jest.fn().mockResolvedValue({ id: "d1" }),
        findUnique: jest.fn().mockResolvedValue({ id: "d1", status: "PENDING" }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      outboxEvent: { findUnique: jest.fn().mockResolvedValue({ aggregateId: "disp1", payload: {} }) },
      disposition: {
        findFirst: jest.fn().mockResolvedValue({
          code: "spoke_to_target",
          channel: "DOOR",
          supportLevel: "STRONG_SUPPORT",
          consentAt: new Date("2026-08-01T00:00:00Z"),
        }),
      },
      contact: {
        findFirst: jest.fn().mockResolvedValue({
          id: "c1",
          canonicalContactId: null,
          email: "ada@example.org",
          phoneE164: "+61400000000",
          firstName: "Ada",
          lastName: "Nguyen",
        }),
      },
      contactSourceRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      contactTag: { findFirst: jest.fn().mockResolvedValue({ id: "tag1" }) },
      contactTagAssignment: { findFirst: jest.fn().mockResolvedValue({ id: "as1" }) },
    };
    const crypto = { decrypt: jest.fn(() => "apikey") };
    const writeConnector = {
      matchPerson: jest.fn().mockResolvedValue(null),
      upsertPerson: jest.fn().mockResolvedValue({ externalId: "nb9" }),
      addTags: jest.fn().mockResolvedValue(undefined),
      logContact: jest.fn().mockResolvedValue(undefined),
      updatePersonFields: jest.fn().mockResolvedValue(undefined),
    };
    const contacts = { recordSourceRecord: jest.fn().mockResolvedValue(undefined) };
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const flags = { isEnabled: jest.fn().mockResolvedValue(opts.flagOn ?? true) };
    const queue = { enqueue: jest.fn().mockResolvedValue({ jobId: "q1", queued: true }) };
    const service = new CrmPushService(
      prisma,
      crypto as any,
      writeConnector as any,
      contacts as any,
      logger as any,
      flags as any,
      queue as any,
    );
    return { service, prisma, crypto, writeConnector, contacts, logger, flags, queue };
  }

  const p2002 = () =>
    new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "0" } as any);

  describe("recordEventForPush (reaction half)", () => {
    it("records + enqueues one delivery per ACTIVE NB connection with push on", async () => {
      const { service, prisma, queue } = build();
      prisma.integrationConnection.findMany.mockResolvedValue([
        { id: "conn1", settings: pushOnSettings },
      ]);
      await service.recordEventForPush(envelope() as any, "disposition");
      expect(prisma.integrationPushDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ connectionId: "conn1", eventId: "evt1", stream: "disposition" }),
        }),
      );
      expect(queue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ id: "integration-push_d1", queue: "integration-push" }),
      );
    });

    it("does nothing while the global kill switch is off", async () => {
      const { service, prisma } = build({ flagOn: false });
      await service.recordEventForPush(envelope() as any, "disposition");
      expect(prisma.integrationConnection.findMany).not.toHaveBeenCalled();
      expect(prisma.integrationPushDelivery.create).not.toHaveBeenCalled();
    });

    it("respects the per-connection master switch and stream toggles", async () => {
      const { service, prisma } = build();
      prisma.integrationConnection.findMany.mockResolvedValue([
        { id: "off", settings: {} }, // push.enabled defaults false
        { id: "streamOff", settings: { dataSync: { push: { enabled: true, streams: { dispositions: false } } } } },
      ]);
      await service.recordEventForPush(envelope() as any, "disposition");
      expect(prisma.integrationPushDelivery.create).not.toHaveBeenCalled();
    });

    it("I7: a tag that came FROM NationBuilder never echoes back", async () => {
      const { service, prisma } = build();
      prisma.integrationConnection.findMany.mockResolvedValue([
        { id: "conn1", settings: pushOnSettings },
      ]);
      await service.recordEventForPush(
        envelope({ eventType: "contacts.tag.added", payload: { contactId: "c1", key: "x", source: "nation_builder" } }) as any,
        "tag",
      );
      expect(prisma.integrationPushDelivery.create).not.toHaveBeenCalled();
    });

    it("I1: a replayed event lands on the existing row; a terminal one is not re-enqueued", async () => {
      const { service, prisma, queue } = build();
      prisma.integrationConnection.findMany.mockResolvedValue([
        { id: "conn1", settings: pushOnSettings },
      ]);
      prisma.integrationPushDelivery.create.mockRejectedValue(p2002());
      prisma.integrationPushDelivery.findUnique.mockResolvedValue({ id: "d1", status: "SUCCEEDED" });
      await service.recordEventForPush(envelope() as any, "disposition");
      expect(queue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("processDeliveryJob (worker half)", () => {
    it("a terminal delivery replays as a silent no-op", async () => {
      const { service, prisma, crypto } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(baseDelivery({ status: "SUCCEEDED" }));
      const out = await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(out.status).toBe("SUCCEEDED");
      expect(crypto.decrypt).not.toHaveBeenCalled();
    });

    it("I8: a non-ACTIVE connection parks the delivery HELD after one DB read", async () => {
      const { service, prisma, crypto, writeConnector } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(
        baseDelivery({ connection: { ...activeConnection(pushOnSettings), status: "NEEDS_ATTENTION" } }),
      );
      const out = await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(out.status).toBe("HELD");
      expect(crypto.decrypt).not.toHaveBeenCalled();
      expect(writeConnector.logContact).not.toHaveBeenCalled();
    });

    it("pushes a consented disposition as an NB contact log carrying the support level", async () => {
      const { service, prisma, writeConnector } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(baseDelivery());
      prisma.contactSourceRecord.findFirst.mockResolvedValue({ externalId: "nb42" });
      const out = await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(out.status).toBe("SUCCEEDED");
      expect(writeConnector.logContact).toHaveBeenCalledWith(
        "apikey",
        "nb42",
        expect.objectContaining({ method: "door_knock", statusCode: "spoke_to_target", supportLevel: 1 }),
        "https://riverside.nationbuilder.com",
      );
    });

    it("withholds the support level when the row carries no consent — the log still goes", async () => {
      const { service, prisma, writeConnector } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(baseDelivery());
      prisma.contactSourceRecord.findFirst.mockResolvedValue({ externalId: "nb42" });
      prisma.disposition.findFirst.mockResolvedValue({
        code: "spoke_to_target",
        channel: "DOOR",
        supportLevel: "STRONG_SUPPORT",
        consentAt: null,
      });
      await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      const call = writeConnector.logContact.mock.calls[0][2];
      expect(call.supportLevel).toBeUndefined();
      // The ledger says so honestly.
      const success = prisma.integrationPushDelivery.update.mock.calls.find(
        (c: any[]) => c[0]?.data?.status === "SUCCEEDED",
      );
      expect(success![0].data.requestSummary).toMatchObject({ withheld: ["support_level"] });
    });

    it("I2: resolves identity ONLY through the nation-scoped mapping", async () => {
      const { service, prisma } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(baseDelivery());
      prisma.contactSourceRecord.findFirst.mockResolvedValue({ externalId: "nb42" });
      await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(prisma.contactSourceRecord.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sourceSystem: "nation_builder:riverside" }),
        }),
      );
    });

    it("identity ladder: an NB match persists the scoped mapping for next time", async () => {
      const { service, prisma, writeConnector, contacts } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(baseDelivery());
      writeConnector.matchPerson.mockResolvedValue({ externalId: "nb77" });
      await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(contacts.recordSourceRecord).toHaveBeenCalledWith(
        expect.objectContaining({ sourceSystem: "nation_builder:riverside", externalId: "nb77" }),
      );
    });

    it("creates the person via people/push when allowed, else SKIPs as no_person_match", async () => {
      const { service, prisma, writeConnector } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(baseDelivery());
      await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(writeConnector.upsertPerson).toHaveBeenCalled(); // createMissingPeople defaults on

      const { service: s2, prisma: p2, writeConnector: w2 } = build();
      p2.integrationPushDelivery.findUnique.mockResolvedValue(
        baseDelivery({
          connection: activeConnection({ dataSync: { push: { enabled: true, createMissingPeople: false } } }),
        }),
      );
      const out = await s2.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(out).toMatchObject({ status: "SKIPPED", skipReason: "no_person_match" });
      expect(w2.upsertPerson).not.toHaveBeenCalled();
    });

    it("I8: an auth failure trips the breaker — connection NEEDS_ATTENTION, delivery HELD, no throw", async () => {
      const { service, prisma, writeConnector } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(baseDelivery());
      prisma.contactSourceRecord.findFirst.mockResolvedValue({ externalId: "nb42" });
      writeConnector.logContact.mockRejectedValue(new IntegrationAuthError("token rejected"));
      const out = await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(out.status).toBe("HELD");
      expect(prisma.integrationConnection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "NEEDS_ATTENTION" } }),
      );
    });

    it("secret drift fails fast as UnrecoverableError — no 10-attempt backoff churn", async () => {
      const { service, prisma, crypto } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(baseDelivery());
      crypto.decrypt.mockImplementation(() => {
        throw new CredentialDecryptionError(new Error("bad"));
      });
      await expect(service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" })).rejects.toBeInstanceOf(
        UnrecoverableError,
      );
    });

    it("a retryable provider error goes back to PENDING and rethrows for BullMQ backoff", async () => {
      const { service, prisma, writeConnector } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(baseDelivery());
      prisma.contactSourceRecord.findFirst.mockResolvedValue({ externalId: "nb42" });
      writeConnector.logContact.mockRejectedValue(new Error("502 from NB"));
      await expect(service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" })).rejects.toThrow("502");
      const back = prisma.integrationPushDelivery.update.mock.calls.find(
        (c: any[]) => c[0]?.data?.status === "PENDING",
      );
      expect(back).toBeDefined();
    });

    it("I1/F6: a retry after partial success skips the ops that already succeeded", async () => {
      const { service, prisma, writeConnector } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(
        baseDelivery({ responseSummary: { ops: { "0:logContact": "ok" } } }),
      );
      prisma.contactSourceRecord.findFirst.mockResolvedValue({ externalId: "nb42" });
      const out = await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(out.status).toBe("SUCCEEDED");
      expect(writeConnector.logContact).not.toHaveBeenCalled(); // already done last attempt
    });

    it("tag stream: pushes the current tag, or SKIPs when the assignment has since gone", async () => {
      const { service, prisma, writeConnector } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(baseDelivery({ stream: "tag" }));
      prisma.outboxEvent.findUnique.mockResolvedValue({ payload: { key: "doorknockers" } });
      prisma.contactSourceRecord.findFirst.mockResolvedValue({ externalId: "nb42" });
      await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(writeConnector.addTags).toHaveBeenCalledWith(
        "apikey",
        "nb42",
        ["doorknockers"],
        "https://riverside.nationbuilder.com",
      );

      const { service: s2, prisma: p2 } = build();
      p2.integrationPushDelivery.findUnique.mockResolvedValue(baseDelivery({ stream: "tag" }));
      p2.outboxEvent.findUnique.mockResolvedValue({ payload: { key: "doorknockers" } });
      p2.contactTagAssignment.findFirst.mockResolvedValue(null); // removed since the event
      const out = await s2.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(out).toMatchObject({ status: "SKIPPED", skipReason: "source_row_gone" });
    });

    it("re-checks the stream toggle at send time — an organiser's off is honoured", async () => {
      const { service, prisma } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(
        baseDelivery({
          connection: activeConnection({ dataSync: { push: { enabled: true, streams: { dispositions: false } } } }),
        }),
      );
      const out = await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(out).toMatchObject({ status: "SKIPPED" });
    });
  });

  describe("remaining streams", () => {
    it("survey: pushes a contact-log note built from the question + chosen answer", async () => {
      const { service, prisma, writeConnector } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(baseDelivery({ stream: "survey" }));
      prisma.contactSourceRecord.findFirst.mockResolvedValue({ externalId: "nb42" });
      prisma.outboxEvent.findUnique.mockResolvedValue({ aggregateId: "qr1" });
      prisma.questionResponse = {
        findFirst: jest.fn().mockResolvedValue({
          valueText: null,
          channel: "DOOR",
          option: { label: "Strongly agree" },
          question: { prompt: "Should Australia lift climate targets?" },
        }),
      };
      await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(writeConnector.logContact).toHaveBeenCalledWith(
        "apikey",
        "nb42",
        expect.objectContaining({
          method: "door_knock",
          note: "Survey: Should Australia lift climate targets? – Strongly agree",
        }),
        expect.any(String),
      );
    });

    it("opt-out (consent transition): pushes the do-not-contact flag from CURRENT truth only", async () => {
      const { service, prisma, writeConnector } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(
        baseDelivery({ stream: "opt_out", eventType: "messaging.consent.changed" }),
      );
      prisma.contactSourceRecord.findFirst.mockResolvedValue({ externalId: "nb42" });
      prisma.outboxEvent.findUnique.mockResolvedValue({
        eventType: "messaging.consent.changed",
        payload: { channel: "SMS", phoneE164: "+61400000000", state: "OPTED_OUT" },
      });
      prisma.contactConsent = { findFirst: jest.fn().mockResolvedValue({ state: "OPTED_OUT" }) };
      await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(writeConnector.updatePersonFields).toHaveBeenCalledWith(
        "apikey",
        "nb42",
        { mobile_opt_in: false },
        expect.any(String),
      );

      // Re-opted-in since the event ⇒ the stale opt-out never reaches the CRM.
      const { service: s2, prisma: p2, writeConnector: w2 } = build();
      p2.integrationPushDelivery.findUnique.mockResolvedValue(
        baseDelivery({ stream: "opt_out", eventType: "messaging.consent.changed" }),
      );
      p2.outboxEvent.findUnique.mockResolvedValue({
        eventType: "messaging.consent.changed",
        payload: { channel: "SMS", phoneE164: "+61400000000", state: "OPTED_OUT" },
      });
      p2.contactConsent = { findFirst: jest.fn().mockResolvedValue({ state: "OPTED_IN" }) };
      const out = await s2.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(out).toMatchObject({ status: "SKIPPED", skipReason: "opt_out_superseded" });
      expect(w2.updatePersonFields).not.toHaveBeenCalled();
    });

    it("opt-out (dialler DNC): sets do_not_call", async () => {
      const { service, prisma, writeConnector } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(
        baseDelivery({ stream: "opt_out", eventType: "autodialer.contact.opted-out" }),
      );
      prisma.contactSourceRecord.findFirst.mockResolvedValue({ externalId: "nb42" });
      prisma.outboxEvent.findUnique.mockResolvedValue({
        eventType: "autodialer.contact.opted-out",
        payload: { phoneE164: "+61400000000" },
      });
      await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(writeConnector.updatePersonFields).toHaveBeenCalledWith(
        "apikey",
        "nb42",
        { do_not_call: true },
        expect.any(String),
      );
    });

    it("text reply: pushes the body as a note (the stream itself is opt-in)", async () => {
      const { service, prisma, writeConnector } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(
        baseDelivery({
          stream: "text_reply",
          connection: activeConnection({ dataSync: { push: { enabled: true, streams: { textReplies: true } } } }),
        }),
      );
      prisma.contactSourceRecord.findFirst.mockResolvedValue({ externalId: "nb42" });
      prisma.outboxEvent.findUnique.mockResolvedValue({ aggregateId: "in1" });
      prisma.inboundMessage = {
        findFirst: jest.fn().mockResolvedValue({ body: "Count me in for Saturday" }),
      };
      await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(writeConnector.logContact).toHaveBeenCalledWith(
        "apikey",
        "nb42",
        expect.objectContaining({ method: "text_message", note: "Text reply: Count me in for Saturday" }),
        expect.any(String),
      );
    });

    it("rsvp: learns the contact from the re-read, tags per event and logs the note", async () => {
      const { service, prisma, writeConnector } = build();
      prisma.integrationPushDelivery.findUnique.mockResolvedValue(
        baseDelivery({ stream: "rsvp", contactId: null, eventType: "events.rsvp.created" }),
      );
      prisma.contactSourceRecord.findFirst.mockResolvedValue({ externalId: "nb42" });
      prisma.outboxEvent.findUnique.mockResolvedValue({
        aggregateId: "rsvp1",
        eventType: "events.rsvp.created",
      });
      prisma.eventRsvp = {
        findFirst: jest.fn().mockResolvedValue({
          contactId: "c1",
          eventId: "event-abcdefgh",
          event: { title: "Door-knock training night" },
        }),
      };
      await service.processDeliveryJob({ deliveryId: "d1", tenantId: "org1" });
      expect(writeConnector.addTags).toHaveBeenCalledWith(
        "apikey",
        "nb42",
        ["uprise-rsvp-abcdefgh"],
        expect.any(String),
      );
      expect(writeConnector.logContact).toHaveBeenCalledWith(
        "apikey",
        "nb42",
        expect.objectContaining({ note: "RSVP: Door-knock training night" }),
        expect.any(String),
      );
    });

    it("reaction guards: consent opt-INs and NB-imported opt-outs never record", async () => {
      const { service, prisma } = build();
      prisma.integrationConnection.findMany.mockResolvedValue([
        { id: "conn1", settings: pushOnSettings },
      ]);
      await service.recordEventForPush(
        envelope({
          eventType: "messaging.consent.changed",
          payload: { contactId: "c1", state: "OPTED_IN", source: "start_keyword" },
        }) as any,
        "opt_out",
      );
      await service.recordEventForPush(
        envelope({
          eventType: "messaging.consent.changed",
          payload: { contactId: "c1", state: "OPTED_OUT", source: "nation_builder_sync" },
        }) as any,
        "opt_out",
      );
      expect(prisma.integrationPushDelivery.create).not.toHaveBeenCalled();
    });
  });

  describe("transparency surface", () => {
    it("lists deliveries with filters + clamped paging", async () => {
      const { service, prisma } = build();
      prisma.integrationPushDelivery.findMany.mockResolvedValue([{ id: "d1" }]);
      prisma.integrationPushDelivery.count = jest.fn().mockResolvedValue(1);
      const out = await service.listDeliveries("org1", { stream: "disposition", limit: 5000 });
      expect(out).toEqual({ rows: [{ id: "d1" }], total: 1 });
      expect(prisma.integrationPushDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "org1", stream: "disposition" },
          take: 100, // clamped
        }),
      );
    });

    it("retries a FAILED delivery back through the queue; a SUCCEEDED one 409s", async () => {
      const { service, prisma, queue } = build();
      prisma.integrationPushDelivery.findFirst = jest
        .fn()
        .mockResolvedValue({ id: "d1", status: "FAILED", tenantId: "org1" });
      await service.retryDelivery("org1", "d1");
      expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ id: "integration-push_d1" }));

      prisma.integrationPushDelivery.findFirst.mockResolvedValue({
        id: "d1",
        status: "SUCCEEDED",
        tenantId: "org1",
      });
      await expect(service.retryDelivery("org1", "d1")).rejects.toMatchObject({});
    });
  });

  describe("sweepPushDeliveries (I9)", () => {
    it("re-enqueues stale PENDING rows and releases HELD rows on reactivated connections", async () => {
      const { service, prisma, queue } = build();
      prisma.integrationPushDelivery.findMany.mockResolvedValue([
        { id: "p1", tenantId: "org1", status: "PENDING" },
        { id: "h1", tenantId: "org1", status: "HELD" },
      ]);
      const out = await service.sweepPushDeliveries();
      expect(out).toEqual({ requeued: 2, released: 1 });
      expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ id: "integration-push_p1" }));
      expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ id: "integration-push_h1" }));
      // The HELD row was moved back to PENDING before its re-enqueue.
      const release = prisma.integrationPushDelivery.update.mock.calls.find(
        (c: any[]) => c[0]?.where?.id === "h1" && c[0]?.data?.status === "PENDING",
      );
      expect(release).toBeDefined();
    });
  });
});
