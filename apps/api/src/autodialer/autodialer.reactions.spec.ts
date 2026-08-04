import { assertReactionsLoopSafe, EVENT_TYPES, type EventEnvelope } from "@uprise/events";
import { CallStatus } from "@uprise/db";
import { buildAutodialerReactions } from "./autodialer.reactions";

function setup() {
  const tx = {
    dialerAttempt: { update: jest.fn().mockResolvedValue({}) },
    dialerCallSession: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    call: { findUnique: jest.fn().mockResolvedValue(null) },
    dialerAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
    dialerCallSession: { findFirst: jest.fn().mockResolvedValue(null) },
    dialerSessionEvent: { create: jest.fn().mockResolvedValue({}) },
    disposition: { create: jest.fn().mockResolvedValue({}) },
    suppression: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const outbox = { append: jest.fn().mockResolvedValue(undefined) };
  const logger = { debug: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const reactions = buildAutodialerReactions({
    prisma: prisma as never,
    outbox: outbox as never,
    logger: logger as never,
  });
  const byTrigger = (trigger: string) => {
    const found = reactions.find((r) => r.trigger === trigger);
    if (!found) throw new Error(`no reaction for ${trigger}`);
    return found;
  };
  return { prisma, tx, outbox, logger, reactions, byTrigger };
}

const envelope = (eventType: string, payload: unknown, aggregateId = "call1"): EventEnvelope =>
  ({ id: "evt1", eventType, tenantId: "t1", aggregateId, payload }) as unknown as EventEnvelope;

const attempt = (over: Record<string, unknown> = {}) => ({
  id: "at1",
  tenantId: "t1",
  campaignId: "dc1",
  callId: "call1",
  outcome: "PENDING",
  ...over,
});

const session = (over: Record<string, unknown> = {}) => ({
  id: "sess1",
  tenantId: "t1",
  campaignId: "dc1",
  callId: "call1",
  targetCallId: "call2",
  status: "CONNECTED",
  ...over,
});

describe("buildAutodialerReactions registry shape", () => {
  it("registers four loop-safe reactions on the expected triggers", () => {
    const { reactions } = setup();
    expect(reactions.map((r) => r.trigger)).toEqual([
      "telephony.call.status-changed",
      "telephony.call.completed",
      "autodialer.survey.answer-recorded",
      "autodialer.contact.opted-out",
    ]);
    expect(() => assertReactionsLoopSafe(reactions)).not.toThrow();
  });
});

describe("telephony mirror — attempt outcomes", () => {
  it("maps terminal statuses onto the attempt and announces the finish", async () => {
    const { byTrigger, prisma, tx, outbox } = setup();
    prisma.dialerAttempt.findFirst.mockResolvedValue(attempt());
    await byTrigger("telephony.call.status-changed").handle(
      envelope("telephony.call.status-changed", { callId: "call1", status: "NO_ANSWER" }),
    );
    expect(tx.dialerAttempt.update).toHaveBeenCalledWith({
      where: { id: "at1" },
      data: { outcome: "NO_ANSWER" },
    });
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: EVENT_TYPES.DIALER_ATTEMPT_FINISHED,
        aggregateId: "at1",
        payload: expect.objectContaining({ outcome: "NO_ANSWER", callId: "call1" }),
      }),
    );
  });

  it("COMPLETED splits on the AMD verdict: machineDetected ⇒ MACHINE, else ANSWERED", async () => {
    const { byTrigger, prisma, tx } = setup();
    prisma.dialerAttempt.findFirst.mockResolvedValue(attempt());
    prisma.call.findUnique.mockResolvedValue({ id: "call1", machineDetected: true });
    await byTrigger("telephony.call.completed").handle(
      envelope("telephony.call.completed", { callId: "call1", durationSeconds: 12 }),
    );
    expect(tx.dialerAttempt.update).toHaveBeenCalledWith({
      where: { id: "at1" },
      data: { outcome: "MACHINE" },
    });
    tx.dialerAttempt.update.mockClear();
    prisma.call.findUnique.mockResolvedValue({ id: "call1", machineDetected: false });
    await byTrigger("telephony.call.completed").handle(
      envelope("telephony.call.completed", { callId: "call1", durationSeconds: 12 }),
    );
    expect(tx.dialerAttempt.update).toHaveBeenCalledWith({
      where: { id: "at1" },
      data: { outcome: "ANSWERED" },
    });
  });

  it("BUSY and FAILED pass through as themselves", async () => {
    const { byTrigger, prisma, tx } = setup();
    prisma.dialerAttempt.findFirst.mockResolvedValue(attempt());
    for (const status of [CallStatus.BUSY, CallStatus.FAILED]) {
      tx.dialerAttempt.update.mockClear();
      await byTrigger("telephony.call.status-changed").handle(
        envelope("telephony.call.status-changed", { callId: "call1", status }),
      );
      expect(tx.dialerAttempt.update).toHaveBeenCalledWith({
        where: { id: "at1" },
        data: { outcome: status },
      });
    }
  });

  it("non-terminal statuses mirror nothing", async () => {
    const { byTrigger, prisma } = setup();
    await byTrigger("telephony.call.status-changed").handle(
      envelope("telephony.call.status-changed", { callId: "call1", status: "RINGING" }),
    );
    expect(prisma.dialerAttempt.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("never clobbers an outcome a richer path already wrote", async () => {
    const { byTrigger, prisma, tx, outbox } = setup();
    prisma.dialerAttempt.findFirst.mockResolvedValue(attempt({ outcome: "OPTED_OUT" }));
    await byTrigger("telephony.call.completed").handle(
      envelope("telephony.call.completed", { callId: "call1", durationSeconds: 30 }),
    );
    expect(tx.dialerAttempt.update).not.toHaveBeenCalled();
    expect(outbox.append).not.toHaveBeenCalled();
  });

  it("falls back to the aggregateId when the payload has no callId", async () => {
    const { byTrigger, prisma } = setup();
    await byTrigger("telephony.call.status-changed").handle(
      envelope("telephony.call.status-changed", { status: "FAILED" }, "call-agg"),
    );
    expect(prisma.dialerAttempt.findFirst).toHaveBeenCalledWith({ where: { callId: "call-agg" } });
  });
});

describe("telephony mirror — widget session lifecycle", () => {
  it("caller leg ending ends the session: status, event, progress rows", async () => {
    const { byTrigger, prisma, tx, outbox } = setup();
    prisma.dialerCallSession.findFirst.mockResolvedValue(session());
    await byTrigger("telephony.call.completed").handle(
      envelope("telephony.call.completed", { callId: "call1", durationSeconds: 45 }),
    );
    expect(tx.dialerCallSession.update).toHaveBeenCalledWith({
      where: { id: "sess1" },
      data: { status: "ENDED", endedAt: expect.any(Date) },
    });
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: EVENT_TYPES.DIALER_SESSION_ENDED,
        aggregateId: "sess1",
        payload: expect.objectContaining({ durationSeconds: 45 }),
      }),
    );
    const progressNames = prisma.dialerSessionEvent.create.mock.calls.map(
      (call: never[]) => (call[0] as { data: { name: string } }).data.name,
    );
    expect(progressNames).toEqual(["call_disconnected", "call_ended"]);
  });

  it("the target leg ending publishes progress but leaves the session live", async () => {
    const { byTrigger, prisma, tx } = setup();
    prisma.dialerCallSession.findFirst.mockResolvedValue(session());
    await byTrigger("telephony.call.completed").handle(
      envelope("telephony.call.completed", { callId: "call2", durationSeconds: 45 }),
    );
    expect(tx.dialerCallSession.update).not.toHaveBeenCalled();
    expect(prisma.dialerSessionEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: "sess1",
        name: "call_disconnected",
        payload: expect.objectContaining({ leg: "target" }),
      }),
    });
  });

  it("an already-ENDED session is not re-ended", async () => {
    const { byTrigger, prisma, tx } = setup();
    prisma.dialerCallSession.findFirst.mockResolvedValue(session({ status: "ENDED" }));
    await byTrigger("telephony.call.completed").handle(
      envelope("telephony.call.completed", { callId: "call1", durationSeconds: 45 }),
    );
    expect(tx.dialerCallSession.update).not.toHaveBeenCalled();
  });
});

describe("disposition write-back", () => {
  const payload = {
    tenantId: "t1",
    campaignId: "dc1",
    callId: "call1",
    contactId: "c1",
    questionKey: "q1",
    digit: "1",
    value: "Yes",
    dispositionCode: "SUPPORTS",
    supportLevel: "STRONG_SUPPORT",
  };

  it("lands the answer on the contact as a PHONE-channel disposition", async () => {
    const { byTrigger, prisma } = setup();
    await byTrigger("autodialer.survey.answer-recorded").handle(
      envelope("autodialer.survey.answer-recorded", payload),
    );
    expect(prisma.disposition.create).toHaveBeenCalledWith({
      data: {
        tenantId: "t1",
        contactId: "c1",
        code: "SUPPORTS",
        layer: "CONTACT_RESULT",
        channel: "PHONE",
        campaignId: "dc1",
        supportLevel: "STRONG_SUPPORT",
      },
    });
  });

  it("skips answers without a dispositionCode or without a contact", async () => {
    const { byTrigger, prisma } = setup();
    await byTrigger("autodialer.survey.answer-recorded").handle(
      envelope("autodialer.survey.answer-recorded", { ...payload, dispositionCode: null }),
    );
    await byTrigger("autodialer.survey.answer-recorded").handle(
      envelope("autodialer.survey.answer-recorded", { ...payload, contactId: null }),
    );
    expect(prisma.disposition.create).not.toHaveBeenCalled();
  });
});

describe("suppression mirror", () => {
  const payload = {
    tenantId: "t1",
    campaignId: "dc1",
    phoneE164: "+61400000000",
    contactId: "c1",
    source: "ivr_star",
  };

  it("mirrors the opt-out into the messaging suppression ledger", async () => {
    const { byTrigger, prisma } = setup();
    await byTrigger("autodialer.contact.opted-out").handle(
      envelope("autodialer.contact.opted-out", payload, "at1"),
    );
    expect(prisma.suppression.create).toHaveBeenCalledWith({
      data: { tenantId: "t1", phoneE164: "+61400000000", reason: "IVR opt-out", source: "ivr_star" },
    });
  });

  it("keeps the ledger single-row per phone", async () => {
    const { byTrigger, prisma } = setup();
    prisma.suppression.findFirst.mockResolvedValue({ id: "sup1" });
    await byTrigger("autodialer.contact.opted-out").handle(
      envelope("autodialer.contact.opted-out", payload, "at1"),
    );
    expect(prisma.suppression.create).not.toHaveBeenCalled();
  });

  it("no phone, nothing to suppress", async () => {
    const { byTrigger, prisma } = setup();
    await byTrigger("autodialer.contact.opted-out").handle(
      envelope("autodialer.contact.opted-out", { ...payload, phoneE164: null }, "at1"),
    );
    expect(prisma.suppression.findFirst).not.toHaveBeenCalled();
  });
});
