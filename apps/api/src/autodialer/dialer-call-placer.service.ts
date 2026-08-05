import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CallStatus, ConsentState, DialerCampaignStatus, MessageChannel } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { TwilioService, type ResolvedSender } from "../twilio/twilio.service";
import { TelephonySenderResolver } from "../telephony/telephony-sender.resolver";
import { isVoiceCapable } from "../telephony/phone-capabilities";
import { isWithinCallingWindow, resolveTenantTimezone } from "./dialer-window.util";
import { SessionProgressService } from "./session-progress.service";
import type { DialerPlaceCallJobPayload, DialerPlaceTargetJobPayload } from "../common/queue/queue.payloads";

/**
 * Places the provider leg for one dial attempt.
 *
 * Transaction discipline mirrors CallsService.initiate: the telephony.Call row
 * and its CALL_INITIATED outbox event commit together, then the Twilio dispatch
 * happens OUTSIDE the transaction; a dispatch failure is written back as a
 * FAILED terminal status (CAS on INITIATED) plus the attempt outcome, so the
 * telephony-mirror reaction and the engine's caps both see it.
 */
@Injectable()
export class DialerCallPlacerService {
  private readonly logger = new Logger(DialerCallPlacerService.name);
  private readonly outbox: Pick<OutboxService, "append">;
  private readonly progress: Pick<SessionProgressService, "publish">;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly twilio: TwilioService,
    private readonly senderResolver: TelephonySenderResolver,
    @Optional() outbox?: OutboxService,
    @Optional() progress?: SessionProgressService,
  ) {
    this.outbox = outbox ?? { append: async () => {} };
    this.progress = progress ?? { publish: async () => {} };
  }

  async placeCall(payload: DialerPlaceCallJobPayload, now: Date = new Date()): Promise<{ placed: boolean; reason?: string }> {
    const attempt = await this.prisma.dialerAttempt.findFirst({
      where: { id: payload.attemptId, tenantId: payload.tenantId },
    });
    if (!attempt || attempt.outcome !== "PENDING" || attempt.callId) {
      return { placed: false, reason: "attempt-not-placeable" };
    }

    const campaign = await this.prisma.dialerCampaign.findFirst({
      where: { id: attempt.campaignId, tenantId: attempt.tenantId },
    });
    if (!campaign || campaign.status !== DialerCampaignStatus.ACTIVE) {
      await this.cancelAttempt(attempt.id, "campaign-not-active");
      return { placed: false, reason: "campaign-not-active" };
    }

    // A queued job can outlive the calling window's edge — re-check both the
    // window and consent immediately before money is spent.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: attempt.tenantId },
      select: { settings: true },
    });
    if (!isWithinCallingWindow(campaign, resolveTenantTimezone(tenant?.settings), now)) {
      await this.cancelAttempt(attempt.id, "outside-window");
      return { placed: false, reason: "outside-window" };
    }
    const optedOut = await this.prisma.contactConsent.findFirst({
      where: {
        tenantId: attempt.tenantId,
        phoneE164: attempt.phoneE164,
        channel: MessageChannel.VOICE,
        state: ConsentState.OPTED_OUT,
      },
      select: { id: true },
    });
    if (optedOut) {
      await this.prisma.dialerAttempt.update({
        where: { id: attempt.id },
        data: { outcome: "OPTED_OUT" },
      });
      return { placed: false, reason: "opted-out" };
    }

    // Sender: campaign-pinned number → tenant marketing default → platform env.
    const sender = await this.resolveSender(campaign.tenantId, campaign.fromNumberId);
    const effectiveFrom =
      sender?.from ||
      this.config.get<string>("TWILIO_VOICE_FROM", "").trim() ||
      this.config.get<string>("TWILIO_PHONE_NUMBER", "").trim();
    if (!effectiveFrom || !isVoiceCapable(effectiveFrom)) {
      await this.cancelAttempt(attempt.id, "no-voice-sender");
      return { placed: false, reason: "no-voice-sender" };
    }

    // Row + event commit together; provider HTTP stays outside the transaction.
    const call = await this.prisma.$transaction(async (tx) => {
      const created = await tx.call.create({
        data: {
          tenantId: attempt.tenantId,
          contactId: attempt.contactId,
          toNumber: attempt.phoneE164,
          fromNumber: effectiveFrom,
          status: CallStatus.INITIATED,
        },
      });
      await tx.dialerAttempt.update({ where: { id: attempt.id }, data: { callId: created.id } });
      await this.outbox.append(tx, {
        tenantId: attempt.tenantId,
        eventType: "telephony.call.initiated",
        aggregateId: created.id,
        payload: { callId: created.id, tenantId: attempt.tenantId, toNumber: attempt.phoneE164 },
      });
      await this.outbox.append(tx, {
        tenantId: attempt.tenantId,
        eventType: "autodialer.attempt.placed",
        aggregateId: attempt.id,
        payload: {
          attemptId: attempt.id,
          campaignId: attempt.campaignId,
          tenantId: attempt.tenantId,
          callId: created.id,
          attemptNo: attempt.attemptNo,
        },
      });
      return created;
    });

    try {
      const { sid } = await this.twilio.placeCall({
        to: attempt.phoneE164,
        from: effectiveFrom,
        url: this.answerUrl(campaign.id, attempt.id),
        sender,
        record: campaign.recordingEnabled,
        machineDetection: campaign.amdEnabled ? "Enable" : undefined,
        timeout: this.ringTimeoutSeconds(),
      });
      await this.prisma.call.update({ where: { id: call.id }, data: { providerCallId: sid } });
      return { placed: true };
    } catch (err) {
      await this.markDispatchFailed(call.id, attempt.id, err);
      return { placed: false, reason: "dispatch-failed" };
    }
  }

  /**
   * The click-to-call target leg (dialer.call.place-target): dial the resolved
   * target into the session's conference as an independent leg (join
   * false/false — the caller owns the room). No AMD here: a human is holding.
   * Idempotent under BullMQ retries via the targetCallId bind.
   */
  async placeTargetLeg(
    payload: DialerPlaceTargetJobPayload,
    now: Date = new Date(),
  ): Promise<{ placed: boolean; reason?: string }> {
    const session = await this.prisma.dialerCallSession.findFirst({
      where: { id: payload.sessionId, tenantId: payload.tenantId },
    });
    if (!session) return { placed: false, reason: "session-not-found" };
    if (session.targetCallId) return { placed: false, reason: "already-placed" };
    if (session.status !== "CONNECTED") return { placed: false, reason: "session-not-connected" };
    const target = session.targetNumber;
    if (!target) return { placed: false, reason: "no-target-number" };

    const campaign = await this.prisma.dialerCampaign.findFirst({
      where: { id: session.campaignId, tenantId: session.tenantId },
    });
    if (!campaign || campaign.status !== DialerCampaignStatus.ACTIVE) {
      return { placed: false, reason: "campaign-not-active" };
    }

    const sender = await this.resolveSender(campaign.tenantId, campaign.fromNumberId);
    const effectiveFrom =
      sender?.from ||
      this.config.get<string>("TWILIO_VOICE_FROM", "").trim() ||
      this.config.get<string>("TWILIO_PHONE_NUMBER", "").trim();
    if (!effectiveFrom || !isVoiceCapable(effectiveFrom)) {
      await this.progress.publish(session.id, session.tenantId, "error", {
        message: "We couldn't place the call to the target.",
      });
      return { placed: false, reason: "no-voice-sender" };
    }

    // Row + event commit together; provider HTTP stays outside the transaction.
    const call = await this.prisma.$transaction(async (tx) => {
      const created = await tx.call.create({
        data: {
          tenantId: session.tenantId,
          contactId: null,
          toNumber: target,
          fromNumber: effectiveFrom,
          status: CallStatus.INITIATED,
          startedAt: now,
        },
      });
      await tx.dialerCallSession.update({
        where: { id: session.id },
        data: { targetCallId: created.id },
      });
      await this.outbox.append(tx, {
        tenantId: session.tenantId,
        eventType: "telephony.call.initiated",
        aggregateId: created.id,
        payload: { callId: created.id, tenantId: session.tenantId, toNumber: target },
      });
      return created;
    });

    try {
      const { sid } = await this.twilio.placeCall({
        to: target,
        from: effectiveFrom,
        url: this.conferenceJoinUrl(campaign.id, session.id),
        sender,
        record: campaign.recordingEnabled,
        timeout: this.ringTimeoutSeconds(),
      });
      await this.prisma.call.update({ where: { id: call.id }, data: { providerCallId: sid } });
      return { placed: true };
    } catch (err) {
      await this.markTargetDispatchFailed(session.id, session.tenantId, call.id, err);
      return { placed: false, reason: "dispatch-failed" };
    }
  }

  /* ────────────────────────────── internals ───────────────────────────── */

  private async resolveSender(
    tenantId: string,
    fromNumberId: string | null,
  ): Promise<ResolvedSender | undefined> {
    if (fromNumberId) {
      const pinned = await this.senderResolver.resolveByNumberId(tenantId, fromNumberId);
      if (pinned) return pinned;
    }
    // "voice", not "marketing": the dialler PLACES CALLS, and every SendPurpose is a
    // messaging purpose whose resolution is filtered to SMS-capable numbers. Asking for
    // "marketing" could only return the tenant's +614 mobile, which the `isVoiceCapable`
    // guards on both call paths then reject – so a tenant with a provisioned local number
    // still dialled from the platform env number.
    return this.senderResolver.resolve({ tenantId, purpose: "voice" });
  }

  private answerUrl(campaignId: string, attemptId: string): string {
    const base = this.config.get<string>("API_BASE_URL", "").trim().replace(/\/+$/, "");
    return `${base}/api/v1/autodialer/ivr/answer?campaignId=${encodeURIComponent(campaignId)}&attemptId=${encodeURIComponent(attemptId)}`;
  }

  private conferenceJoinUrl(campaignId: string, sessionId: string): string {
    const base = this.config.get<string>("API_BASE_URL", "").trim().replace(/\/+$/, "");
    return `${base}/api/v1/autodialer/ivr/conference-join?campaignId=${encodeURIComponent(campaignId)}&sessionId=${encodeURIComponent(sessionId)}`;
  }

  private ringTimeoutSeconds(): number {
    const configured = Number(this.config.get<string>("DIALER_RING_TIMEOUT_SECONDS", "15"));
    return Number.isFinite(configured) && configured >= 5 ? Math.min(configured, 60) : 15;
  }

  private async cancelAttempt(attemptId: string, reason: string): Promise<void> {
    this.logger.log(`Attempt ${attemptId} cancelled: ${reason}`);
    await this.prisma.dialerAttempt.update({
      where: { id: attemptId },
      data: { outcome: "CANCELED" },
    });
  }

  /**
   * Dispatch failed before Twilio accepted the call: terminal-fail the Call row
   * (CAS on INITIATED — a webhook can never have raced a call that was never
   * placed, but the guard keeps the write idempotent under job retries), emit
   * the status event, and fail the attempt.
   */
  private async markDispatchFailed(callId: string, attemptId: string, err: unknown): Promise<void> {
    const providerCode = (err as { code?: number | string })?.code;
    const errorMessage = err instanceof Error ? err.message : String(err);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.call.updateMany({
        where: { id: callId, status: CallStatus.INITIATED },
        data: {
          status: CallStatus.FAILED,
          errorCode: providerCode != null ? String(providerCode) : null,
          errorMessage,
          endedAt: new Date(),
        },
      });
      if (updated.count === 0) return;
      const call = await tx.call.findUnique({ where: { id: callId }, select: { tenantId: true } });
      if (!call) return;
      await this.outbox.append(tx, {
        tenantId: call.tenantId,
        eventType: "telephony.call.status-changed",
        aggregateId: callId,
        payload: {
          callId,
          tenantId: call.tenantId,
          status: CallStatus.FAILED,
          source: "dispatch",
          errorCode: providerCode != null ? String(providerCode) : undefined,
          errorMessage,
        },
      });
      await tx.dialerAttempt.update({ where: { id: attemptId }, data: { outcome: "FAILED" } });
    });
    this.logger.error(`placeCall dispatch failed (call=${callId}): ${errorMessage}`);
  }

  /**
   * The target leg failed before Twilio accepted it. Terminal-fail the Call
   * row + status event (same CAS discipline as markDispatchFailed) and tell
   * the widget — the caller is still holding in the conference, so the session
   * stays live until they hang up (which ends the room).
   */
  private async markTargetDispatchFailed(
    sessionId: string,
    tenantId: string,
    callId: string,
    err: unknown,
  ): Promise<void> {
    const providerCode = (err as { code?: number | string })?.code;
    const errorMessage = err instanceof Error ? err.message : String(err);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.call.updateMany({
        where: { id: callId, status: CallStatus.INITIATED },
        data: {
          status: CallStatus.FAILED,
          errorCode: providerCode != null ? String(providerCode) : null,
          errorMessage,
          endedAt: new Date(),
        },
      });
      if (updated.count === 0) return;
      await this.outbox.append(tx, {
        tenantId,
        eventType: "telephony.call.status-changed",
        aggregateId: callId,
        payload: {
          callId,
          tenantId,
          status: CallStatus.FAILED,
          source: "dispatch",
          errorCode: providerCode != null ? String(providerCode) : undefined,
          errorMessage,
        },
      });
    });
    await this.progress.publish(sessionId, tenantId, "error", {
      message: "We couldn't reach the target. Please try again later.",
    });
    this.logger.error(`placeTargetLeg dispatch failed (session=${sessionId}): ${errorMessage}`);
  }
}
