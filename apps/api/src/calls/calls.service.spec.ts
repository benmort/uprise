import { CallStatus } from "@uprise/db";
import { CallsService } from "./calls.service";

function setup(callRow?: any) {
  const prisma: any = {
    tenant: { upsert: jest.fn(async () => ({ id: "t1", slug: "default" })) },
    call: {
      create: jest.fn(async ({ data }: any) => ({ id: "call1", ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: "call1", ...data })),
      findUnique: jest.fn(async () => callRow ?? null),
      findFirst: jest.fn(async () => callRow ?? null),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      groupBy: jest.fn(async () => []),
      aggregate: jest.fn(async () => ({ _sum: { durationSeconds: null } })),
    },
    // Supports both forms: the callback form (writes) and the array form (list + count).
    $transaction: jest.fn(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
  };
  // Platform env: a voice-capable local caller id (the +614 mobile case is covered explicitly).
  const env: Record<string, string> = { TWILIO_VOICE_FROM: "+61255501111" };
  const config = { get: jest.fn((k: string, fb?: string) => env[k] ?? fb ?? "") } as any;
  const outbox = { append: jest.fn() } as any;
  const webhookEvents = { claim: jest.fn(async () => true), release: jest.fn() } as any;
  const twilio = {
    placeCall: jest.fn(async () => ({ sid: "CA_live", status: "queued" })),
    mintVoiceToken: jest.fn(() => "jwt.voice.token"),
    buildDialTwiml: jest.fn(() => "<Response><Dial>+61400000999</Dial></Response>"),
  } as any;
  const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), log: jest.fn() } as any;
  const telephonyAuth = { tokenForAccountSid: jest.fn(async () => "tok_platform") } as any;
  const voiceAccounts = {
    resolveForTenant: jest.fn(async () => ({
      mode: "platform",
      accountSid: "AC_platform",
      callerId: "+61255501111",
      apiKeySid: "SK1",
      apiKeySecret: "secret",
      twimlAppSid: "AP1",
    })),
    callerIdForAccount: jest.fn(async () => "+61255501111"),
  } as any;
  const senderResolver = { resolveByNumberId: jest.fn(async () => null) } as any;
  const svc = new CallsService(
    prisma,
    config,
    outbox,
    webhookEvents,
    twilio,
    logger,
    telephonyAuth,
    voiceAccounts,
    senderResolver,
  );
  return { svc, prisma, config, outbox, webhookEvents, twilio, logger, telephonyAuth, voiceAccounts, senderResolver };
}

describe("CallsService", () => {
  describe("initiate", () => {
    it("writes INITIATED + outbox atomically, dispatches, and binds the provider CallSid", async () => {
      const { svc, prisma, outbox, twilio } = setup();
      await svc.initiate("t1", { toNumber: "+61400000001", url: "https://x/twiml" });

      expect(prisma.call.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: CallStatus.INITIATED, toNumber: "+61400000001" }) }),
      );
      expect(outbox.append).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "telephony.call.initiated", aggregateId: "call1" }),
      );
      expect(twilio.placeCall).toHaveBeenCalledWith(
        expect.objectContaining({ to: "+61400000001", url: "https://x/twiml" }),
      );
      expect(prisma.call.update).toHaveBeenCalledWith({ where: { id: "call1" }, data: { providerCallId: "CA_live" } });
    });

    it("rejects a non-E.164 toNumber", async () => {
      const { svc } = setup();
      await expect(svc.initiate("t1", { toNumber: "0400 000 001" })).rejects.toThrow();
    });

    it("rejects a +614 (SMS-only) fromNumber with VOICE_NUMBER_REQUIRED", async () => {
      const { svc, prisma } = setup();
      await expect(
        svc.initiate("t1", { toNumber: "+61255500001", fromNumber: "+61485052501" }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: "VOICE_NUMBER_REQUIRED" }) });
      expect(prisma.call.create).not.toHaveBeenCalled();
    });

    it("rejects when the env fallback numbers are also mobiles (nothing voice-capable)", async () => {
      const { svc, config } = setup();
      config.get.mockImplementation((k: string, fb?: string) =>
        k === "TWILIO_VOICE_FROM" ? "+61485052501" : (fb ?? ""),
      );
      await expect(svc.initiate("t1", { toNumber: "+61255500001" })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "VOICE_NUMBER_REQUIRED" }),
      });
    });

    it("marks the call FAILED and rethrows when dispatch fails", async () => {
      const { svc, prisma, twilio } = setup();
      twilio.placeCall.mockRejectedValueOnce(new Error("twilio down"));
      await expect(svc.initiate("t1", { toNumber: "+61400000001", url: "https://x/twiml" })).rejects.toThrow("twilio down");
      expect(prisma.call.update).toHaveBeenCalledWith({ where: { id: "call1" }, data: { status: CallStatus.FAILED } });
    });
  });

  describe("processStatusCallback", () => {
    it("skips a duplicate status delivery (claim=false)", async () => {
      const { svc, prisma, webhookEvents } = setup();
      webhookEvents.claim.mockResolvedValueOnce(false);
      await svc.processStatusCallback({ callSid: "CA1", status: "completed" });
      expect(prisma.call.findUnique).not.toHaveBeenCalled();
    });

    it("claims per (callSid:status) so distinct statuses each apply", async () => {
      const { svc, webhookEvents } = setup({ id: "call1", status: CallStatus.INITIATED, providerCallId: "CA1" });
      await svc.processStatusCallback({ callSid: "CA1", status: "ringing" });
      expect(webhookEvents.claim).toHaveBeenCalledWith("twilio-voice", "CA1:ringing");
    });

    it("transitions to IN_PROGRESS binding startedAt", async () => {
      const startedAt = new Date("2026-06-22T00:00:00Z");
      const { svc, prisma } = setup({ id: "call1", status: CallStatus.RINGING, providerCallId: "CA1" });
      await svc.processStatusCallback({ callSid: "CA1", status: "in-progress", startedAt });
      expect(prisma.call.update).toHaveBeenCalledWith({
        where: { id: "call1" },
        data: { status: CallStatus.IN_PROGRESS, startedAt },
      });
    });

    it("binds duration/recording/price/currency on completed", async () => {
      const { svc, prisma } = setup({ id: "call1", status: CallStatus.IN_PROGRESS, providerCallId: "CA1" });
      await svc.processStatusCallback({
        callSid: "CA1",
        status: "completed",
        durationSeconds: 42,
        recordingUrl: "https://rec/1",
        priceCents: 2,
        currency: "USD",
      });
      const data = prisma.call.update.mock.calls[0][0].data;
      expect(data).toEqual(
        expect.objectContaining({
          status: CallStatus.COMPLETED,
          durationSeconds: 42,
          recordingUrl: "https://rec/1",
          priceCents: 2,
          currency: "USD",
        }),
      );
      expect(data.endedAt).toBeInstanceOf(Date);
    });

    it.each([
      ["failed", CallStatus.FAILED],
      ["busy", CallStatus.BUSY],
      ["no-answer", CallStatus.NO_ANSWER],
    ])("captures the failure reason + endedAt and logs on %s", async (raw, target) => {
      const { svc, prisma, outbox, logger } = setup({ id: "call1", tenantId: "t1", toNumber: "+61400000001", status: CallStatus.INITIATED, providerCallId: "CA1" });
      await svc.processStatusCallback({
        callSid: "CA1",
        status: raw,
        errorCode: "13224",
        errorMessage: "Twilio could not connect the call",
        sipCode: "486",
      });
      const data = prisma.call.update.mock.calls[0][0].data;
      expect(data).toEqual(
        expect.objectContaining({
          status: target,
          errorCode: "13224",
          errorMessage: "Twilio could not connect the call",
          sipCode: "486",
        }),
      );
      expect(data.endedAt).toBeInstanceOf(Date);
      // The failure is logged with the provider's reason so it's identifiable, not silent.
      expect(logger.warn).toHaveBeenCalledWith(
        "telephony",
        expect.stringContaining("without connecting"),
        expect.objectContaining({ callId: "call1", status: target, errorCode: "13224", sipCode: "486" }),
      );
      // The status-changed event carries the error for failure-alerting reactions.
      expect(outbox.append).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: "telephony.call.status-changed",
          payload: expect.objectContaining({ status: target, errorCode: "13224" }),
        }),
      );
    });

    it("records a failure with null reason when the provider sends no error fields", async () => {
      const { svc, prisma } = setup({ id: "call1", status: CallStatus.INITIATED, providerCallId: "CA1" });
      await svc.processStatusCallback({ callSid: "CA1", status: "failed" });
      const data = prisma.call.update.mock.calls[0][0].data;
      expect(data).toEqual(
        expect.objectContaining({ status: CallStatus.FAILED, errorCode: null, errorMessage: null, sipCode: null }),
      );
      expect(data.endedAt).toBeInstanceOf(Date);
    });

    it("is an idempotent no-op on a replayed terminal transition", async () => {
      const { svc, prisma } = setup({ id: "call1", status: CallStatus.COMPLETED, providerCallId: "CA1" });
      await svc.processStatusCallback({ callSid: "CA1", status: "completed" });
      expect(prisma.call.update).not.toHaveBeenCalled();
    });

    it("ignores a non-transitional status (queued) — no transition update", async () => {
      const { svc, prisma } = setup({ id: "call1", status: CallStatus.INITIATED, providerCallId: "CA1" });
      await svc.processStatusCallback({ callSid: "CA1", status: "queued" });
      expect(prisma.call.update).not.toHaveBeenCalled();
    });

    it("is a no-op for an unknown call (no row)", async () => {
      const { svc, prisma } = setup(null);
      await svc.processStatusCallback({ callSid: "CA_unknown", status: "completed" });
      expect(prisma.call.update).not.toHaveBeenCalled();
    });

    it("releases the claim and rethrows when the update throws", async () => {
      const { svc, prisma, webhookEvents } = setup({ id: "call1", status: CallStatus.RINGING, providerCallId: "CA1" });
      prisma.call.update.mockRejectedValueOnce(new Error("db down"));
      await expect(svc.processStatusCallback({ callSid: "CA1", status: "completed" })).rejects.toThrow("db down");
      expect(webhookEvents.release).toHaveBeenCalledWith("twilio-voice", "CA1:completed");
    });
  });

  describe("listCalls", () => {
    it("returns the {items,total} envelope and applies status/search/date filters + pagination", async () => {
      const { svc, prisma } = setup();
      prisma.call.findMany.mockResolvedValueOnce([{ id: "c1" }]);
      prisma.call.count.mockResolvedValueOnce(1);
      const res = await svc.listCalls("t1", {
        status: [CallStatus.COMPLETED, CallStatus.FAILED],
        search: "0400",
        contactId: "ct1",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-02-01T00:00:00.000Z",
        limit: 10,
        offset: 20,
      });
      expect(res).toEqual({ items: [{ id: "c1" }], total: 1 });
      const args = prisma.call.findMany.mock.calls[0][0];
      expect(args).toEqual(expect.objectContaining({ take: 10, skip: 20, orderBy: { createdAt: "desc" } }));
      expect(args.where).toEqual(
        expect.objectContaining({
          tenantId: "t1",
          status: { in: [CallStatus.COMPLETED, CallStatus.FAILED] },
          contactId: "ct1",
        }),
      );
      expect(args.where.OR).toHaveLength(2);
      expect(args.where.createdAt).toEqual({ gte: new Date("2026-01-01T00:00:00.000Z"), lte: new Date("2026-02-01T00:00:00.000Z") });
    });

    it("defaults to 25/offset 0 and clamps the limit to 200", async () => {
      const { svc, prisma } = setup();
      await svc.listCalls("t1", {});
      expect(prisma.call.findMany.mock.calls[0][0]).toEqual(expect.objectContaining({ take: 25, skip: 0 }));
      await svc.listCalls("t1", { limit: 9999 });
      expect(prisma.call.findMany.mock.calls[1][0].take).toBe(200);
    });
  });

  describe("stats", () => {
    it("aggregates total, per-status counts and total talk time over the filter", async () => {
      const { svc, prisma } = setup();
      prisma.call.groupBy.mockResolvedValueOnce([
        { status: CallStatus.COMPLETED, _count: { _all: 3 } },
        { status: CallStatus.FAILED, _count: { _all: 1 } },
      ]);
      prisma.call.aggregate.mockResolvedValueOnce({ _sum: { durationSeconds: 120 } });
      const res = await svc.stats("t1", { status: [CallStatus.COMPLETED] });
      expect(res).toEqual({ total: 4, byStatus: { COMPLETED: 3, FAILED: 1 }, totalDurationSeconds: 120 });
      expect(prisma.call.groupBy.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ tenantId: "t1", status: { in: [CallStatus.COMPLETED] } }),
      );
    });

    it("treats a null duration sum as 0", async () => {
      const { svc } = setup();
      const res = await svc.stats("t1");
      expect(res).toEqual({ total: 0, byStatus: {}, totalDurationSeconds: 0 });
    });
  });

  describe("voiceToken", () => {
    it("mints a token under the resolved account and returns the caller id + session identity", async () => {
      const { svc, twilio, voiceAccounts } = setup();
      const res = await svc.voiceToken("user1", "t1");
      expect(voiceAccounts.resolveForTenant).toHaveBeenCalledWith("t1");
      const minted = twilio.mintVoiceToken.mock.calls[0][0];
      expect(minted).toEqual(
        expect.objectContaining({ accountSid: "AC_platform", apiKeySid: "SK1", twimlAppSid: "AP1", identity: "uuser1.tt1" }),
      );
      expect(res).toEqual(
        expect.objectContaining({ token: "jwt.voice.token", identity: "uuser1.tt1", fromNumber: "+61255501111" }),
      );
    });

    it("throws VOICE_NUMBER_REQUIRED (422) when the resolved caller id is a +614 mobile", async () => {
      const { svc, twilio, voiceAccounts } = setup();
      voiceAccounts.resolveForTenant.mockResolvedValueOnce({
        mode: "platform",
        accountSid: "AC_platform",
        callerId: "+61485052501",
        apiKeySid: "SK1",
        apiKeySecret: "secret",
        twimlAppSid: "AP1",
      });
      await expect(svc.voiceToken("u1", "t1")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "VOICE_NUMBER_REQUIRED" }),
      });
      expect(twilio.mintVoiceToken).not.toHaveBeenCalled();
    });

    it("throws VOICE_NUMBER_REQUIRED when no caller id resolves at all (empty marker)", async () => {
      const { svc, voiceAccounts } = setup();
      voiceAccounts.resolveForTenant.mockResolvedValueOnce({
        mode: "platform",
        accountSid: "AC_platform",
        callerId: "",
        apiKeySid: "SK1",
        apiKeySecret: "secret",
        twimlAppSid: "AP1",
      });
      await expect(svc.voiceToken("u1", "t1")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "VOICE_NUMBER_REQUIRED" }),
      });
    });

    it("throws when the resolved account lacks voice credentials", async () => {
      const { svc, voiceAccounts } = setup();
      voiceAccounts.resolveForTenant.mockResolvedValueOnce({
        mode: "platform",
        accountSid: "",
        callerId: "",
        apiKeySid: "",
        apiKeySecret: "",
        twimlAppSid: "",
      });
      await expect(svc.voiceToken("u1", "t1")).rejects.toThrow(/configured/i);
    });
  });

  describe("createBrowserCall", () => {
    it("creates an INITIATED call + initiated event with no provider SID yet", async () => {
      const { svc, prisma, outbox } = setup();
      await svc.createBrowserCall({ tenantId: "t1", toNumber: "+61400000222", fromNumber: "+61400000111", contactId: "ct1" });
      expect(prisma.call.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: CallStatus.INITIATED, toNumber: "+61400000222", contactId: "ct1", fromNumber: "+61400000111" }),
        }),
      );
      expect(outbox.append).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "telephony.call.initiated" }),
      );
    });

    it("rejects a non-E.164 number", async () => {
      const { svc } = setup();
      await expect(
        svc.createBrowserCall({ tenantId: "t1", toNumber: "0400 000", fromNumber: "+61400000111" }),
      ).rejects.toThrow();
    });
  });

  describe("startBrowserCall", () => {
    it("resolves the caller id, creates the call and returns dial TwiML threaded with callId", async () => {
      const { svc, twilio, voiceAccounts } = setup();
      const res = await svc.startBrowserCall({ tenantId: "t1", toNumber: "+61400000333", contactId: "ct1", accountSid: "AC_platform" });
      expect(voiceAccounts.callerIdForAccount).toHaveBeenCalledWith("t1", "AC_platform");
      expect(twilio.buildDialTwiml).toHaveBeenCalledWith(
        expect.objectContaining({ to: "+61400000333", callerId: "+61255501111", callId: "call1" }),
      );
      expect(res.twiml).toContain("<Dial");
    });

    it("uses the explicitly picked tenant number when fromNumberId resolves voice-capable", async () => {
      const { svc, twilio, voiceAccounts, senderResolver } = setup();
      senderResolver.resolveByNumberId.mockResolvedValueOnce({
        accountSid: "AC_sub",
        authToken: "tok",
        from: "+61255059999",
      });
      await svc.startBrowserCall({ tenantId: "t1", toNumber: "+61400000333", fromNumberId: "num1" });
      expect(senderResolver.resolveByNumberId).toHaveBeenCalledWith("t1", "num1");
      // The explicit pick wins — no account-based fallback lookup needed.
      expect(voiceAccounts.callerIdForAccount).not.toHaveBeenCalled();
      expect(twilio.buildDialTwiml).toHaveBeenCalledWith(
        expect.objectContaining({ callerId: "+61255059999" }),
      );
    });

    it("ignores a +614 fromNumberId pick and falls back to the account caller id", async () => {
      const { svc, twilio, voiceAccounts, senderResolver } = setup();
      senderResolver.resolveByNumberId.mockResolvedValueOnce({
        accountSid: "AC_sub",
        authToken: "tok",
        from: "+61485052501",
      });
      await svc.startBrowserCall({ tenantId: "t1", toNumber: "+61400000333", fromNumberId: "num1", accountSid: "AC_platform" });
      expect(voiceAccounts.callerIdForAccount).toHaveBeenCalledWith("t1", "AC_platform");
      expect(twilio.buildDialTwiml).toHaveBeenCalledWith(
        expect.objectContaining({ callerId: "+61255501111" }),
      );
    });

    it("answers with a spoken explanation + hangup (no call row) when only a mobile resolves", async () => {
      const { svc, prisma, twilio, voiceAccounts } = setup();
      voiceAccounts.callerIdForAccount.mockResolvedValueOnce("+61485052501");
      const res = await svc.startBrowserCall({ tenantId: "t1", toNumber: "+61400000333", accountSid: "AC_platform" });
      expect(res.twiml).toContain("<Say");
      expect(res.twiml).toContain("<Hangup/>");
      expect(res.twiml).not.toContain("<Dial");
      expect(prisma.call.create).not.toHaveBeenCalled();
      expect(twilio.buildDialTwiml).not.toHaveBeenCalled();
    });
  });

  describe("processStatusCallback — browser calls (callId)", () => {
    it("looks up by id and binds the provider SID on the first callback", async () => {
      const { svc, prisma } = setup({ id: "call1", status: CallStatus.INITIATED, providerCallId: null });
      await svc.processStatusCallback({ callSid: "CAbrowser", status: "ringing" }, "call1");
      expect(prisma.call.findUnique).toHaveBeenCalledWith({ where: { id: "call1" } });
      expect(prisma.call.update).toHaveBeenCalledWith({ where: { id: "call1" }, data: { providerCallId: "CAbrowser" } });
    });

    it("ignores a callback whose SID contradicts an already-bound call", async () => {
      const { svc, prisma } = setup({ id: "call1", status: CallStatus.RINGING, providerCallId: "CAoriginal" });
      await svc.processStatusCallback({ callSid: "CAdifferent", status: "completed" }, "call1");
      expect(prisma.call.update).not.toHaveBeenCalled();
    });
  });

  describe("processRecordingCallback", () => {
    it("binds the recording by callId for browser calls", async () => {
      const { svc, prisma } = setup({ id: "call1", providerCallId: "CAx" });
      await svc.processRecordingCallback({ callSid: "CAx", recordingUrl: "https://rec/2" }, "call1");
      expect(prisma.call.findUnique).toHaveBeenCalledWith({ where: { id: "call1" } });
      expect(prisma.call.update).toHaveBeenCalledWith({ where: { id: "call1" }, data: { recordingUrl: "https://rec/2" } });
    });

    it("binds the recording URL to its call by CallSid", async () => {
      const { svc, prisma, webhookEvents } = setup({ id: "call1", providerCallId: "CA1" });
      await svc.processRecordingCallback({ callSid: "CA1", recordingUrl: "https://rec/1" });
      expect(webhookEvents.claim).toHaveBeenCalledWith("twilio-voice", "CA1:recording");
      expect(prisma.call.update).toHaveBeenCalledWith({ where: { id: "call1" }, data: { recordingUrl: "https://rec/1" } });
    });

    it("skips when no recording URL is present", async () => {
      const { svc, webhookEvents } = setup();
      await svc.processRecordingCallback({ callSid: "CA1" });
      expect(webhookEvents.claim).not.toHaveBeenCalled();
    });

    it("skips a duplicate delivery (claim=false)", async () => {
      const { svc, prisma, webhookEvents } = setup({ id: "call1", providerCallId: "CA1" });
      webhookEvents.claim.mockResolvedValueOnce(false);
      await svc.processRecordingCallback({ callSid: "CA1", recordingUrl: "https://rec/1" });
      expect(prisma.call.findUnique).not.toHaveBeenCalled();
    });

    it("is a no-op for an unknown call", async () => {
      const { svc, prisma } = setup(null);
      await svc.processRecordingCallback({ callSid: "CA_unknown", recordingUrl: "https://rec/1" });
      expect(prisma.call.update).not.toHaveBeenCalled();
    });

    it("releases the claim and rethrows on error", async () => {
      const { svc, prisma, webhookEvents } = setup({ id: "call1", providerCallId: "CA1" });
      prisma.call.update.mockRejectedValueOnce(new Error("db down"));
      await expect(svc.processRecordingCallback({ callSid: "CA1", recordingUrl: "https://rec/1" })).rejects.toThrow("db down");
      expect(webhookEvents.release).toHaveBeenCalledWith("twilio-voice", "CA1:recording");
    });
  });

  describe("streamRecording", () => {
    const realFetch = global.fetch;
    afterEach(() => {
      global.fetch = realFetch;
    });

    it("proxies the mp3 with basic-auth for the account SID parsed from the URL", async () => {
      const recordingUrl = "https://api.twilio.com/2010-04-01/Accounts/ACxxx/Recordings/RExxx";
      const { svc, telephonyAuth } = setup({ id: "call1", tenantId: "t1", recordingUrl });
      const fetchMock = jest.fn(async (_url: string, _init: any) => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }));
      global.fetch = fetchMock as any;
      const res = await svc.streamRecording("t1", "call1");
      expect(telephonyAuth.tokenForAccountSid).toHaveBeenCalledWith("ACxxx");
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${recordingUrl}.mp3`);
      expect((init as any).headers.Authorization).toBe(`Basic ${Buffer.from("ACxxx:tok_platform").toString("base64")}`);
      expect(res.contentType).toBe("audio/mpeg");
      expect(Buffer.isBuffer(res.body)).toBe(true);
    });

    it("404s when the call has no recording", async () => {
      const { svc } = setup({ id: "call1", tenantId: "t1", recordingUrl: null });
      await expect(svc.streamRecording("t1", "call1")).rejects.toThrow(/no recording/i);
    });

    it("404s when the call is not found for the tenant", async () => {
      const { svc } = setup(null);
      await expect(svc.streamRecording("t1", "missing")).rejects.toThrow(/not found/i);
    });

    it("404s when the provider returns a non-ok response", async () => {
      const recordingUrl = "https://api.twilio.com/2010-04-01/Accounts/ACxxx/Recordings/RExxx";
      const { svc } = setup({ id: "call1", tenantId: "t1", recordingUrl });
      global.fetch = jest.fn(async () => ({ ok: false, status: 403 })) as any;
      await expect(svc.streamRecording("t1", "call1")).rejects.toThrow(/403/);
    });
  });
});
