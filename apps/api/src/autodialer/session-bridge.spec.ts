import { IvrFlowService, type IvrContext } from "./ivr-flow.service";
import { QUEUE_JOB_TYPES, QUEUE_NAMES } from "../common/queue/queue.constants";

/**
 * The click-to-call bridge: the dialler TwiML app's session-answer, the
 * caller-first conference, the QUEUED target leg (the source's serverless
 * setTimeout is deliberately dead) and the conference lifecycle callbacks.
 */

const TARGET = "+61262774022";

function makeCampaign(over: Record<string, unknown> = {}) {
  return {
    id: "dc1",
    tenantId: "t1",
    defaultLanguage: "en",
    survey: false,
    electoralTarget: false,
    transparentTargetTransfer: true,
    intro: null,
    outro: null,
    optOut: null,
    targetNumbers: [TARGET],
    ...over,
  } as never;
}

function makeSession(over: Record<string, unknown> = {}) {
  return {
    id: "sess1",
    tenantId: "t1",
    campaignId: "dc1",
    status: "CREATED",
    callId: null,
    targetCallId: null,
    conferenceName: "dialer-sess1",
    targetNumber: TARGET,
    targetName: "Alex Example",
    targetParty: null,
    targetElectorate: null,
    language: "en",
    expiresAt: new Date(Date.now() + 10 * 60_000),
    createdAt: new Date(Date.now() - 5_000),
    ...over,
  } as never;
}

function setup() {
  const tx = {
    call: { create: jest.fn().mockResolvedValue({ id: "callC", toNumber: "dialer-sess1" }) },
    dialerCallSession: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    dialerRedirect: { create: jest.fn().mockResolvedValue({ id: "rdr1" }) },
  };
  const prisma = {
    call: { findUnique: jest.fn().mockResolvedValue(null) },
    dialerCallSession: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    dialerRedirect: { findFirst: jest.fn().mockResolvedValue(null) },
    dialerQuestion: { findMany: jest.fn().mockResolvedValue([]) },
    storedFile: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const progress = { publish: jest.fn().mockResolvedValue(undefined) };
  const config = {
    get: jest.fn((key: string, def?: string) => (key === "API_BASE_URL" ? "https://api.test" : (def ?? ""))),
  };
  const logger = { debug: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const outbox = { append: jest.fn().mockResolvedValue(undefined) };
  const queue = { enqueue: jest.fn().mockResolvedValue({ jobId: "j1", queued: true }) };
  const webhookEvents = {
    claim: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(undefined),
  };
  const service = new IvrFlowService(
    prisma as never,
    progress as never,
    config as never,
    logger as never,
    outbox as never,
    undefined,
    undefined,
    queue as never,
    webhookEvents as never,
  );
  return { service, prisma, tx, progress, outbox, queue, webhookEvents };
}

function ctxOf(over: Partial<IvrContext> = {}): IvrContext {
  return {
    campaign: makeCampaign(),
    attempt: null,
    session: makeSession(),
    callId: null,
    language: "en",
    ...over,
  };
}

beforeEach(() => jest.clearAllMocks());

describe("handleSessionAnswer", () => {
  const body = { CallSid: "CAweb1", From: "client:ssess1.tt1" };

  it("binds the caller leg as a telephony.Call, marks the session CONNECTED and rides the behaviour matrix", async () => {
    const { service, tx, progress, outbox } = setup();
    const twiml = await service.handleSessionAnswer(ctxOf(), body);

    expect(tx.call.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "t1",
        providerCallId: "CAweb1",
        fromNumber: "client:ssess1",
        toNumber: "dialer-sess1",
      }),
    });
    expect(tx.dialerCallSession.update).toHaveBeenCalledWith({
      where: { id: "sess1" },
      data: { callId: "callC", status: "CONNECTED" },
    });
    expect(outbox.append).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ eventType: "telephony.call.initiated" }),
    );
    expect(progress.publish).toHaveBeenCalledWith("sess1", "t1", "call_started", {});
    // Transparent transfer routes straight into /redirect (the bridge).
    expect(twiml).toContain("redirect?campaignId=dc1&amp;sessionId=sess1");
  });

  it("a retried TwiML fetch reuses the existing Call row (no duplicate)", async () => {
    const { service, prisma, tx } = setup();
    prisma.call.findUnique.mockResolvedValue({ id: "callC" });
    const ctx = ctxOf({ session: makeSession({ callId: "callC", status: "CONNECTED" }) });
    await service.handleSessionAnswer(ctx, body);
    expect(tx.call.create).not.toHaveBeenCalled();
  });

  it("a dead or expired session gets a spoken expiry, never a bridge", async () => {
    const { service, tx } = setup();
    const ended = await service.handleSessionAnswer(ctxOf({ session: makeSession({ status: "ENDED" }) }), body);
    expect(ended).toContain("expired");
    const expired = await service.handleSessionAnswer(
      ctxOf({ session: makeSession({ expiresAt: new Date(Date.now() - 1000) }) }),
      body,
    );
    expect(expired).toContain("expired");
    expect(tx.call.create).not.toHaveBeenCalled();
  });
});

describe("handleRedirect (session bridge)", () => {
  it("queues the target leg with a session-deterministic job id and a short delay", async () => {
    const { service, queue, progress } = setup();
    await service.handleRedirect(ctxOf({ callId: "callC" }), { CallSid: "CAweb1" }, {});
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: QUEUE_NAMES.DIALER_CALL,
        type: QUEUE_JOB_TYPES.DIALER_PLACE_TARGET,
        payload: { sessionId: "sess1", tenantId: "t1" },
        runAt: expect.any(Date),
      }),
    );
    const { id } = queue.enqueue.mock.calls[0][0];
    expect(id).toContain("sess1");
    expect(progress.publish).toHaveBeenCalledWith(
      "sess1",
      "t1",
      "call_redirecting",
      expect.objectContaining({ name: "Alex Example" }),
    );
  });

  it("writes the transfer ledger row with the session's resolved member", async () => {
    const { service, tx } = setup();
    await service.handleRedirect(
      ctxOf({ session: makeSession({ targetElectorate: "Wills" }), callId: "callC" }),
      {},
      {},
    );
    expect(tx.dialerRedirect.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetNumber: TARGET,
          targetName: "Alex Example",
          electorate: "Wills",
          sessionId: "sess1",
        }),
      }),
    );
  });

  it("a session with no resolvable target gets the apology, and nothing is queued", async () => {
    const { service, queue } = setup();
    const ctx = ctxOf({
      session: makeSession({ targetNumber: null }),
      campaign: makeCampaign({ targetNumbers: null }),
    });
    const twiml = await service.handleRedirect(ctx, {}, {});
    expect(twiml).toContain("unable to connect");
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});

describe("renderConferenceJoin", () => {
  it("joins the room without owning it (false/false)", async () => {
    const { service } = setup();
    const twiml = await service.renderConferenceJoin(ctxOf({ session: makeSession({ status: "CONNECTED" }) }));
    expect(twiml).toContain('startConferenceOnEnter="false"');
    expect(twiml).toContain('endConferenceOnExit="false"');
    expect(twiml).toContain("dialer-sess1");
  });

  it("hangs up into a dead session instead of resurrecting an empty room", async () => {
    const { service } = setup();
    const twiml = await service.renderConferenceJoin(ctxOf({ session: makeSession({ status: "ENDED" }) }));
    expect(twiml).toContain("<Hangup/>");
    expect(twiml).not.toContain("Conference");
  });
});

describe("handleConferenceStatus", () => {
  const liveCtx = () =>
    ctxOf({ session: makeSession({ status: "CONNECTED", callId: "callC", targetCallId: "callT" }) });

  it("target join bridges the session (CAS) and announces the conference", async () => {
    const { service, prisma, progress } = setup();
    prisma.call.findUnique.mockResolvedValue({ id: "callT" });
    await service.handleConferenceStatus(liveCtx(), {
      StatusCallbackEvent: "participant-join",
      CallSid: "CAtarget",
      ConferenceSid: "CF1",
    });
    expect(prisma.dialerCallSession.updateMany).toHaveBeenCalledWith({
      where: { id: "sess1", status: "CONNECTED" },
      data: { status: "BRIDGED" },
    });
    expect(progress.publish).toHaveBeenCalledWith("sess1", "t1", "call_connected_conference", {
      name: "Alex Example",
    });
  });

  it("the caller's own join is not a bridge", async () => {
    const { service, prisma, progress } = setup();
    prisma.call.findUnique.mockResolvedValue({ id: "callC" });
    await service.handleConferenceStatus(liveCtx(), {
      StatusCallbackEvent: "participant-join",
      CallSid: "CAweb1",
    });
    expect(prisma.dialerCallSession.updateMany).not.toHaveBeenCalled();
    expect(progress.publish).not.toHaveBeenCalled();
  });

  it("target leave publishes call_target_hangup", async () => {
    const { service, prisma, progress } = setup();
    prisma.call.findUnique.mockResolvedValue({ id: "callT" });
    await service.handleConferenceStatus(liveCtx(), {
      StatusCallbackEvent: "participant-leave",
      CallSid: "CAtarget",
    });
    expect(progress.publish).toHaveBeenCalledWith("sess1", "t1", "call_target_hangup", {});
  });

  it("conference end folds the session to ENDED once, with the outbox event", async () => {
    const { service, tx, progress, outbox } = setup();
    await service.handleConferenceStatus(liveCtx(), {
      StatusCallbackEvent: "conference-end",
      ConferenceSid: "CF1",
    });
    expect(tx.dialerCallSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sess1", status: { notIn: ["ENDED", "FAILED"] } } }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ eventType: "autodialer.session.ended" }),
    );
    expect(progress.publish).toHaveBeenCalledWith("sess1", "t1", "call_ended", { reason: "conference_end" });
  });

  it("an already-ended session emits nothing more (CAS count 0)", async () => {
    const { service, tx, progress, outbox } = setup();
    tx.dialerCallSession.updateMany.mockResolvedValue({ count: 0 });
    await service.handleConferenceStatus(liveCtx(), { StatusCallbackEvent: "conference-end" });
    expect(outbox.append).not.toHaveBeenCalled();
    expect(progress.publish).not.toHaveBeenCalled();
  });

  it("a lost claim is a no-op; a handler crash releases the claim for the retry", async () => {
    const { service, prisma, webhookEvents, progress } = setup();
    webhookEvents.claim.mockResolvedValue(false);
    await service.handleConferenceStatus(liveCtx(), {
      StatusCallbackEvent: "participant-join",
      CallSid: "CAtarget",
    });
    expect(progress.publish).not.toHaveBeenCalled();

    webhookEvents.claim.mockResolvedValue(true);
    prisma.call.findUnique.mockRejectedValue(new Error("db down"));
    await expect(
      service.handleConferenceStatus(liveCtx(), {
        StatusCallbackEvent: "participant-join",
        CallSid: "CAtarget",
      }),
    ).rejects.toThrow("db down");
    expect(webhookEvents.release).toHaveBeenCalled();
  });
});
