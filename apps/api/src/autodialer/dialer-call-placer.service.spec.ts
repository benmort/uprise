import { CallStatus, DialerCampaignStatus } from "@uprise/db";
import { DialerCallPlacerService } from "./dialer-call-placer.service";

/**
 * The placer's contract: re-check everything that can change while a job sits
 * queued (campaign state, window, consent), commit the Call row + both outbox
 * events together, keep the provider HTTP outside the transaction, and write a
 * dispatch failure back as a terminal FAILED that the caps and mirror see.
 */

// 13:00 AEST — inside the default 09:00–20:00 window.
const NOW = new Date("2026-08-04T03:00:00.000Z");

const attempt = (over: Record<string, unknown> = {}) => ({
  id: "att1",
  tenantId: "t1",
  campaignId: "dc1",
  contactId: "c1",
  phoneE164: "+61491570001",
  attemptNo: 1,
  outcome: "PENDING",
  callId: null,
  ...over,
});

const campaign = (over: Record<string, unknown> = {}) => ({
  id: "dc1",
  tenantId: "t1",
  status: DialerCampaignStatus.ACTIVE,
  dailyStart: "09:00",
  dailyFinish: "20:00",
  fromNumberId: null,
  amdEnabled: true,
  recordingEnabled: false,
  ...over,
});

function makeHarness(over: { env?: Record<string, string> } = {}) {
  const prisma: any = {
    dialerAttempt: { findFirst: jest.fn(), update: jest.fn() },
    dialerCallSession: { findFirst: jest.fn(), update: jest.fn() },
    dialerCampaign: { findFirst: jest.fn() },
    tenant: { findUnique: jest.fn().mockResolvedValue({ settings: null }) },
    contactConsent: { findFirst: jest.fn().mockResolvedValue(null) },
    call: {
      create: jest.fn().mockResolvedValue({ id: "call1" }),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ tenantId: "t1" }),
    },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

  const env: Record<string, string> = {
    API_BASE_URL: "https://api.test",
    TWILIO_VOICE_FROM: "+61370030000",
    ...over.env,
  };
  const config = { get: jest.fn((key: string, fallback = "") => env[key] ?? fallback) } as any;
  const twilio = { placeCall: jest.fn().mockResolvedValue({ sid: "CA123" }) } as any;
  const senderResolver = {
    resolveByNumberId: jest.fn().mockResolvedValue(undefined),
    resolve: jest.fn().mockResolvedValue(undefined),
  } as any;
  const outbox = { append: jest.fn() } as any;
  const progress = { publish: jest.fn().mockResolvedValue(undefined) } as any;

  const service = new DialerCallPlacerService(prisma, config, twilio, senderResolver, outbox, progress);
  return { service, prisma, twilio, senderResolver, outbox, progress, config };
}

const payload = { attemptId: "att1", tenantId: "t1" };

describe("DialerCallPlacerService", () => {
  it("refuses an attempt that is missing, already placed, or not PENDING", async () => {
    const { service, prisma, twilio } = makeHarness();
    prisma.dialerAttempt.findFirst.mockResolvedValue(attempt({ callId: "existing" }));

    const out = await service.placeCall(payload, NOW);

    expect(out).toEqual({ placed: false, reason: "attempt-not-placeable" });
    expect(twilio.placeCall).not.toHaveBeenCalled();
  });

  it("cancels the attempt when the campaign is no longer ACTIVE", async () => {
    const { service, prisma } = makeHarness();
    prisma.dialerAttempt.findFirst.mockResolvedValue(attempt());
    prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ status: DialerCampaignStatus.PAUSED }));

    const out = await service.placeCall(payload, NOW);

    expect(out.reason).toBe("campaign-not-active");
    expect(prisma.dialerAttempt.update).toHaveBeenCalledWith({
      where: { id: "att1" },
      data: { outcome: "CANCELED" },
    });
  });

  it("cancels when the queued job has outlived the calling window", async () => {
    const { service, prisma, twilio } = makeHarness();
    prisma.dialerAttempt.findFirst.mockResolvedValue(attempt());
    prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ dailyFinish: "10:00" }));

    const out = await service.placeCall(payload, NOW);

    expect(out.reason).toBe("outside-window");
    expect(twilio.placeCall).not.toHaveBeenCalled();
  });

  it("marks the attempt OPTED_OUT when consent was withdrawn after enqueue — before any money is spent", async () => {
    const { service, prisma, twilio } = makeHarness();
    prisma.dialerAttempt.findFirst.mockResolvedValue(attempt());
    prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());
    prisma.contactConsent.findFirst.mockResolvedValue({ id: "consent1" });

    const out = await service.placeCall(payload, NOW);

    expect(out.reason).toBe("opted-out");
    expect(prisma.dialerAttempt.update).toHaveBeenCalledWith({
      where: { id: "att1" },
      data: { outcome: "OPTED_OUT" },
    });
    expect(twilio.placeCall).not.toHaveBeenCalled();
  });

  it("cancels when no voice-capable sender can be resolved", async () => {
    const { service, prisma, twilio } = makeHarness({ env: { TWILIO_VOICE_FROM: "" } });
    prisma.dialerAttempt.findFirst.mockResolvedValue(attempt());
    prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());

    const out = await service.placeCall(payload, NOW);

    expect(out.reason).toBe("no-voice-sender");
    expect(twilio.placeCall).not.toHaveBeenCalled();
  });

  it("commits the Call row, attempt binding and BOTH outbox events in one transaction, then dials outside it", async () => {
    const { service, prisma, twilio, outbox } = makeHarness();
    prisma.dialerAttempt.findFirst.mockResolvedValue(attempt());
    prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());

    const out = await service.placeCall(payload, NOW);

    expect(out).toEqual({ placed: true });
    // The row + events share the transaction…
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const eventTypes = outbox.append.mock.calls.map((c: any[]) => c[1].eventType);
    expect(eventTypes).toEqual(["telephony.call.initiated", "autodialer.attempt.placed"]);
    // …and the provider call carries the campaign's posture.
    expect(twilio.placeCall).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+61491570001",
        from: "+61370030000",
        machineDetection: "Enable",
        record: false,
        timeout: 15,
        url: expect.stringContaining("/api/v1/autodialer/ivr/answer?campaignId=dc1&attemptId=att1"),
      }),
    );
    // providerCallId bound after dispatch.
    expect(prisma.call.update).toHaveBeenCalledWith({
      where: { id: "call1" },
      data: { providerCallId: "CA123" },
    });
  });

  it("omits AMD when the campaign disables it", async () => {
    const { service, prisma, twilio } = makeHarness();
    prisma.dialerAttempt.findFirst.mockResolvedValue(attempt());
    prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ amdEnabled: false }));

    await service.placeCall(payload, NOW);

    expect(twilio.placeCall.mock.calls[0][0].machineDetection).toBeUndefined();
  });

  it("prefers the campaign-pinned number, then the tenant voice sender", async () => {
    const { service, prisma, senderResolver, twilio } = makeHarness();
    prisma.dialerAttempt.findFirst.mockResolvedValue(attempt());
    prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ fromNumberId: "num1" }));
    senderResolver.resolveByNumberId.mockResolvedValue({ from: "+61370039999" });

    await service.placeCall(payload, NOW);

    expect(senderResolver.resolveByNumberId).toHaveBeenCalledWith("t1", "num1");
    expect(twilio.placeCall.mock.calls[0][0].from).toBe("+61370039999");
  });

  // The dialler PLACES CALLS. Every SendPurpose is a messaging purpose, and the resolver
  // filters those to SMS-capable numbers – so asking for "marketing" could only be handed
  // the tenant's +614 mobile, which `isVoiceCapable` then rejects. A tenant that had paid
  // for a local number still dialled from the platform env number.
  it("asks the resolver for the VOICE purpose, not a messaging one", async () => {
    const { service, prisma, senderResolver } = makeHarness();
    prisma.dialerAttempt.findFirst.mockResolvedValue(attempt());
    prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ fromNumberId: null }));

    await service.placeCall(payload, NOW);

    expect(senderResolver.resolve).toHaveBeenCalledWith({ tenantId: "t1", purpose: "voice" });
  });

  it("dials from the tenant's resolved voice number when no number is pinned", async () => {
    const { service, prisma, senderResolver, twilio } = makeHarness();
    prisma.dialerAttempt.findFirst.mockResolvedValue(attempt());
    prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ fromNumberId: null }));
    senderResolver.resolve.mockResolvedValue({ from: "+61255501234" });

    await service.placeCall(payload, NOW);

    expect(twilio.placeCall.mock.calls[0][0].from).toBe("+61255501234");
  });

  it("writes a dispatch failure back as terminal FAILED (CAS on INITIATED) + a status event + a FAILED attempt", async () => {
    const { service, prisma, twilio, outbox } = makeHarness();
    prisma.dialerAttempt.findFirst.mockResolvedValue(attempt());
    prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());
    twilio.placeCall.mockRejectedValue(Object.assign(new Error("boom"), { code: 21211 }));

    const out = await service.placeCall(payload, NOW);

    expect(out.reason).toBe("dispatch-failed");
    expect(prisma.call.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "call1", status: CallStatus.INITIATED } }),
    );
    const failEvent = outbox.append.mock.calls.find(
      (c: any[]) => c[1].payload?.status === CallStatus.FAILED,
    );
    expect(failEvent[1].payload).toMatchObject({ source: "dispatch", errorCode: "21211" });
    expect(prisma.dialerAttempt.update).toHaveBeenLastCalledWith({
      where: { id: "att1" },
      data: { outcome: "FAILED" },
    });
  });
});

describe("DialerCallPlacerService.placeTargetLeg", () => {
  const session = (over: Record<string, unknown> = {}) => ({
    id: "sess1",
    tenantId: "t1",
    campaignId: "dc1",
    status: "CONNECTED",
    callId: "callC",
    targetCallId: null,
    targetNumber: "+61262774022",
    conferenceName: "dialer-sess1",
    ...over,
  });
  const targetPayload = { sessionId: "sess1", tenantId: "t1" };

  it("is idempotent: an already-placed or non-CONNECTED session never dials again", async () => {
    const { service, prisma, twilio } = makeHarness();
    prisma.dialerCallSession.findFirst.mockResolvedValue(session({ targetCallId: "callT" }));
    expect((await service.placeTargetLeg(targetPayload, NOW)).reason).toBe("already-placed");
    prisma.dialerCallSession.findFirst.mockResolvedValue(session({ status: "ENDED" }));
    expect((await service.placeTargetLeg(targetPayload, NOW)).reason).toBe("session-not-connected");
    expect(twilio.placeCall).not.toHaveBeenCalled();
  });

  it("refuses when the campaign is no longer ACTIVE", async () => {
    const { service, prisma, twilio } = makeHarness();
    prisma.dialerCallSession.findFirst.mockResolvedValue(session());
    prisma.dialerCampaign.findFirst.mockResolvedValue(campaign({ status: DialerCampaignStatus.PAUSED }));
    expect((await service.placeTargetLeg(targetPayload, NOW)).reason).toBe("campaign-not-active");
    expect(twilio.placeCall).not.toHaveBeenCalled();
  });

  it("tells the widget when no voice sender exists (the caller is still holding)", async () => {
    const { service, prisma, progress } = makeHarness({ env: { TWILIO_VOICE_FROM: "" } });
    prisma.dialerCallSession.findFirst.mockResolvedValue(session());
    prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());
    expect((await service.placeTargetLeg(targetPayload, NOW)).reason).toBe("no-voice-sender");
    expect(progress.publish).toHaveBeenCalledWith("sess1", "t1", "error", expect.anything());
  });

  it("dials the target into the conference — Call row + targetCallId bind + event in one tx, NO AMD", async () => {
    const { service, prisma, twilio, outbox } = makeHarness();
    prisma.dialerCallSession.findFirst.mockResolvedValue(session());
    prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());

    const out = await service.placeTargetLeg(targetPayload, NOW);

    expect(out).toEqual({ placed: true });
    expect(prisma.call.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ toNumber: "+61262774022", status: CallStatus.INITIATED }),
    });
    expect(prisma.dialerCallSession.update).toHaveBeenCalledWith({
      where: { id: "sess1" },
      data: { targetCallId: "call1" },
    });
    expect(outbox.append.mock.calls[0][1].eventType).toBe("telephony.call.initiated");
    const placed = twilio.placeCall.mock.calls[0][0];
    // A human is holding in the conference — machine detection must be absent.
    expect(placed.machineDetection).toBeUndefined();
    expect(placed.url).toContain("/api/v1/autodialer/ivr/conference-join?campaignId=dc1&sessionId=sess1");
    expect(prisma.call.update).toHaveBeenCalledWith({
      where: { id: "call1" },
      data: { providerCallId: "CA123" },
    });
  });

  it("a dispatch failure terminal-fails the Call (CAS) and surfaces an error to the widget", async () => {
    const { service, prisma, twilio, outbox, progress } = makeHarness();
    prisma.dialerCallSession.findFirst.mockResolvedValue(session());
    prisma.dialerCampaign.findFirst.mockResolvedValue(campaign());
    twilio.placeCall.mockRejectedValue(new Error("busy trunk"));

    const out = await service.placeTargetLeg(targetPayload, NOW);

    expect(out.reason).toBe("dispatch-failed");
    expect(prisma.call.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "call1", status: CallStatus.INITIATED } }),
    );
    const failEvent = outbox.append.mock.calls.find(
      (c: any[]) => c[1].payload?.status === CallStatus.FAILED,
    );
    expect(failEvent[1].payload.source).toBe("dispatch");
    expect(progress.publish).toHaveBeenCalledWith("sess1", "t1", "error", expect.anything());
  });
});
