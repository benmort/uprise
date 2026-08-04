import type { DomainEventMap, EventEnvelope, Reaction } from "@uprise/events";
import { EVENT_TYPES } from "@uprise/events";
import { CallStatus, DispositionLayer, EngagementChannel, type SupportLevel } from "@uprise/db";
import type { PrismaService } from "../prisma/prisma.service";
import type { OutboxService } from "../common/outbox/outbox.service";
import type { DomainLogger } from "../common/logging/domain-logger.service";

/**
 * The autodialer's cross-domain choreography:
 *
 * 1. TELEPHONY MIRROR — the first-ever subscriber to the telephony call
 *    events. The shared call ledger owns the provider lifecycle; this reaction
 *    folds each terminal status back onto the campaign layer (attempt outcome,
 *    widget-session progress + status) and announces the finish.
 * 2. DISPOSITION WRITE-BACK — a robo-poll answer whose DialerAnswer carries a
 *    dispositionCode lands on the contact as a canvass Disposition (channel
 *    PHONE), so poll results feed the same targeting loop doorknocking does.
 * 3. SUPPRESSION MIRROR — an IVR star opt-out also lands in the messaging
 *    suppression ledger, matching the STOP-keyword posture.
 *
 * Idempotency comes from the registry's ReactionDedup claim per (source,
 * eventId); handlers stay single-shot writes. Progress rows are written with
 * prisma directly (not SessionProgressService) so the reactions factory needs
 * no AutodialerModule import — the vocabulary is shared via the event names.
 */
export function buildAutodialerReactions(deps: {
  prisma: PrismaService;
  outbox: OutboxService;
  logger: DomainLogger;
}): Reaction[] {
  const { prisma, outbox, logger } = deps;

  /** Terminal CallStatus → attempt outcome (COMPLETED splits on AMD verdict). */
  const outcomeFor = (status: CallStatus, machineDetected: boolean | null) => {
    switch (status) {
      case CallStatus.COMPLETED:
        return machineDetected ? "MACHINE" : "ANSWERED";
      case CallStatus.NO_ANSWER:
        return "NO_ANSWER";
      case CallStatus.BUSY:
        return "BUSY";
      case CallStatus.FAILED:
        return "FAILED";
      default:
        return null; // non-terminal — nothing to mirror
    }
  };

  const publishProgress = async (
    sessionId: string,
    tenantId: string,
    name: string,
    payload?: Record<string, unknown>,
  ) => {
    await prisma.dialerSessionEvent.create({
      data: { tenantId, sessionId, name, payload: (payload ?? undefined) as never },
    });
  };

  const mirrorCallStatus = async (
    event: EventEnvelope,
    status: CallStatus,
    durationSeconds: number | null,
  ) => {
    const callId = String((event.payload as { callId?: string })?.callId ?? event.aggregateId);
    const outcome = outcomeFor(status, null);
    if (!outcome) return;

    const call = await prisma.call.findUnique({ where: { id: callId } });
    const resolved =
      outcome === "ANSWERED" && call?.machineDetected ? "MACHINE" : outcome;

    // Attempts: fold the terminal status in, but never clobber an outcome a
    // richer path already wrote (OPTED_OUT from the IVR star, MACHINE from AMD).
    const attempt = await prisma.dialerAttempt.findFirst({ where: { callId } });
    if (attempt && attempt.outcome === "PENDING") {
      await prisma.$transaction(async (tx) => {
        await tx.dialerAttempt.update({
          where: { id: attempt.id },
          data: { outcome: resolved },
        });
        await outbox.append(tx, {
          tenantId: attempt.tenantId,
          eventType: EVENT_TYPES.DIALER_ATTEMPT_FINISHED,
          aggregateId: attempt.id,
          payload: {
            attemptId: attempt.id,
            campaignId: attempt.campaignId,
            tenantId: attempt.tenantId,
            callId,
            outcome: resolved,
          },
        });
      });
    }

    // Widget sessions: progress + lifecycle when a leg ends.
    const session = await prisma.dialerCallSession.findFirst({
      where: { OR: [{ callId }, { targetCallId: callId }] },
    });
    if (session) {
      const isCallerLeg = session.callId === callId;
      await publishProgress(session.id, session.tenantId, "call_disconnected", {
        leg: isCallerLeg ? "caller" : "target",
        status,
      });
      if (isCallerLeg && session.status !== "ENDED") {
        await prisma.$transaction(async (tx) => {
          await tx.dialerCallSession.update({
            where: { id: session.id },
            data: { status: "ENDED", endedAt: new Date() },
          });
          await outbox.append(tx, {
            tenantId: session.tenantId,
            eventType: EVENT_TYPES.DIALER_SESSION_ENDED,
            aggregateId: session.id,
            payload: {
              sessionId: session.id,
              tenantId: session.tenantId,
              campaignId: session.campaignId,
              status: "ENDED",
              durationSeconds,
            },
          });
        });
        await publishProgress(session.id, session.tenantId, "call_ended", {
          reason: status === CallStatus.COMPLETED ? "completed" : "caller_hangup",
          durationSeconds,
        });
      }
    }
  };

  return [
    {
      trigger: "telephony.call.status-changed",
      emits: ["autodialer.attempt.finished", "autodialer.session.ended"],
      async handle(event) {
        const payload = event.payload as DomainEventMap["telephony.call.status-changed"];
        const status = payload?.status as CallStatus | undefined;
        if (!status) return;
        await mirrorCallStatus(event, status, null);
      },
    },
    {
      trigger: "telephony.call.completed",
      emits: ["autodialer.attempt.finished", "autodialer.session.ended"],
      async handle(event) {
        const payload = event.payload as DomainEventMap["telephony.call.completed"];
        await mirrorCallStatus(event, CallStatus.COMPLETED, payload?.durationSeconds ?? null);
      },
    },
    {
      trigger: "autodialer.survey.answer-recorded",
      emits: [],
      async handle(event) {
        const payload = event.payload as DomainEventMap["autodialer.survey.answer-recorded"];
        if (!payload?.dispositionCode || !payload.contactId) return;
        await prisma.disposition.create({
          data: {
            tenantId: payload.tenantId,
            contactId: payload.contactId,
            code: payload.dispositionCode,
            layer: DispositionLayer.CONTACT_RESULT,
            channel: EngagementChannel.PHONE,
            campaignId: payload.campaignId,
            supportLevel: (payload.supportLevel as SupportLevel | null) ?? null,
          },
        });
        logger.log("autodialer", "robo-poll answer written back as disposition", {
          campaignId: payload.campaignId,
          code: payload.dispositionCode,
        });
      },
    },
    {
      trigger: "autodialer.contact.opted-out",
      emits: [],
      async handle(event) {
        const payload = event.payload as DomainEventMap["autodialer.contact.opted-out"];
        if (!payload?.phoneE164) return;
        // The ledger is append-only with no unique key — keep it single-row
        // per phone by checking first (the registry's dedup already guarantees
        // one execution per event).
        const existing = await prisma.suppression.findFirst({
          where: { tenantId: payload.tenantId, phoneE164: payload.phoneE164 },
        });
        if (existing) return;
        await prisma.suppression.create({
          data: {
            tenantId: payload.tenantId,
            phoneE164: payload.phoneE164,
            reason: "IVR opt-out",
            source: payload.source ?? "ivr_star",
          },
        });
      },
    },
  ];
}
