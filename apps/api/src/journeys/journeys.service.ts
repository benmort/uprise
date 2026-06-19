import { HttpStatus, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import {
  JourneyEnrolmentState,
  JourneyStatus,
  JourneyTriggerType,
  Prisma,
} from "../../src/generated/prisma";
import { ApiHttpException } from "../common/http/api-response";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeEventsService } from "../common/events/realtime-events.service";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";
import { DispatchQueue } from "../common/queue/dispatch-queue";
import { DISPATCH_QUEUE_TOKEN } from "../common/queue/queue.tokens";
import { QUEUE_JOB_TYPES, QUEUE_NAMES, getJourneyRungJobId } from "../common/queue/queue.constants";
import { JourneyRunRungJobPayload } from "../common/queue/queue.payloads";
import { JourneyTriggerPayload, JourneyTriggerPort } from "./journey-trigger.port";
import { SingleSendService } from "./single-send.service";

export type UpdateJourneyInput = {
  name?: string;
  triggerType?: JourneyTriggerType;
  triggerConfig?: Record<string, unknown>;
  reentryCooldownMinutes?: number;
  maxActivePerContact?: number;
  rungs?: { rungIndex?: number; type: string; config?: Record<string, unknown> }[];
};

export type DryRunInput = {
  contactId?: string;
  trigger?: Record<string, unknown>;
};

export type DryRunStep = {
  rungIndex: number;
  type: string;
  config: Record<string, unknown>;
  // For wait: minutes parked. For condition: pass/fail and whether it was actually
  // evaluated. For action: the simulated effect (no side effect performed).
  outcome: "enter" | "wait" | "pass" | "fail" | "not-evaluated" | "action" | "complete";
  detail?: string;
};

// Hard ceiling on rung executions per enrolment — an infinite-loop kill switch.
const RUNG_EXEC_CEILING = 200;
// Waits longer than this are left to the cron sweep instead of a delayed job,
// to avoid a pile of long-delayed jobs sitting in Redis.
const MAX_INLINE_WAIT_MINUTES = 180;

@Injectable()
export class JourneysService implements JourneyTriggerPort {
  private readonly logger = new Logger(JourneysService.name);
  private readonly queue: DispatchQueue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: RealtimeEventsService,
    private readonly singleSend: SingleSendService,
    @Optional() private readonly flags?: FeatureFlagsService,
    @Optional() @Inject(DISPATCH_QUEUE_TOKEN) queue?: DispatchQueue,
  ) {
    this.queue = queue ?? { enqueue: async (job) => ({ jobId: job.id, queued: true }) };
  }

  private isEnabled(): boolean {
    return this.flags ? this.flags.isJourneysEnabled() : true;
  }

  // ── Triggers ────────────────────────────────────────────────────
  async handleTrigger(type: JourneyTriggerType, payload: JourneyTriggerPayload): Promise<void> {
    if (!this.isEnabled()) return;
    const journeys = await this.prisma.journey.findMany({
      where: { organizationId: payload.organizationId, status: JourneyStatus.ACTIVE, triggerType: type },
      include: { rungs: { orderBy: { rungIndex: "asc" }, take: 1 } },
    });
    for (const journey of journeys) {
      if (!this.triggerConfigMatches(journey.triggerConfig, type, payload)) continue;
      await this.tryEnrol(journey, payload);
    }
  }

  private triggerConfigMatches(
    config: unknown,
    type: JourneyTriggerType,
    payload: JourneyTriggerPayload,
  ): boolean {
    const cfg = (config && typeof config === "object" ? config : {}) as Record<string, unknown>;
    switch (type) {
      case JourneyTriggerType.disposition_set:
        return !cfg.code || cfg.code === payload.code;
      case JourneyTriggerType.survey_answer:
        if (cfg.questionId && cfg.questionId !== payload.questionId) return false;
        if (cfg.optionId && cfg.optionId !== payload.optionId) return false;
        return true;
      case JourneyTriggerType.tag_added:
        return !cfg.tag || cfg.tag === payload.tag;
      case JourneyTriggerType.message_received:
        return !cfg.blastId || cfg.blastId === payload.blastId;
      default:
        return true;
    }
  }

  private async tryEnrol(
    journey: { id: string; organizationId: string; reentryCooldownMinutes: number; maxActivePerContact: number },
    payload: JourneyTriggerPayload,
  ): Promise<void> {
    const activeCount = await this.prisma.journeyEnrolment.count({
      where: {
        journeyId: journey.id,
        contactId: payload.contactId,
        state: { in: [JourneyEnrolmentState.ACTIVE, JourneyEnrolmentState.WAITING] },
      },
    });
    if (activeCount >= journey.maxActivePerContact) return;

    if (journey.reentryCooldownMinutes > 0) {
      const since = new Date(Date.now() - journey.reentryCooldownMinutes * 60_000);
      const recent = await this.prisma.journeyEnrolment.findFirst({
        where: { journeyId: journey.id, contactId: payload.contactId, enrolledAt: { gte: since } },
      });
      if (recent) return;
    }

    const enrolment = await this.prisma.journeyEnrolment.create({
      data: {
        organizationId: journey.organizationId,
        journeyId: journey.id,
        contactId: payload.contactId,
        currentRungIndex: 0,
        state: JourneyEnrolmentState.ACTIVE,
        context: { trigger: payload as unknown as object },
      },
    });
    await this.enqueueRung(enrolment.id, 0);
    this.events.emit("journey.enrolment.updated", { enrolmentId: enrolment.id, state: enrolment.state });
  }

  private async enqueueRung(enrolmentId: string, rungIndex: number, runAt?: Date): Promise<void> {
    await this.queue.enqueue<JourneyRunRungJobPayload>({
      id: getJourneyRungJobId(enrolmentId, rungIndex),
      queue: QUEUE_NAMES.JOURNEY_RUN,
      type: QUEUE_JOB_TYPES.JOURNEY_RUN_RUNG,
      payload: { enrolmentId, rungIndex },
      runAt,
      removeOnComplete: true,
    });
  }

  // ── Rung execution (worker entry) ───────────────────────────────
  async processRungJob(payload: JourneyRunRungJobPayload): Promise<{ state: JourneyEnrolmentState }> {
    const enrolment = await this.prisma.journeyEnrolment.findUnique({
      where: { id: payload.enrolmentId },
      include: { journey: { include: { rungs: { orderBy: { rungIndex: "asc" } } } } },
    });
    if (!enrolment) return { state: JourneyEnrolmentState.EXITED };

    // Idempotency: stale/dup jobs whose rung no longer matches are no-ops.
    if (
      (enrolment.state !== JourneyEnrolmentState.ACTIVE &&
        enrolment.state !== JourneyEnrolmentState.WAITING) ||
      enrolment.currentRungIndex !== payload.rungIndex
    ) {
      return { state: enrolment.state };
    }

    if (enrolment.rungExecCount >= RUNG_EXEC_CEILING) {
      this.logger.warn(`Journey enrolment ${enrolment.id} hit rung-exec ceiling; failing`);
      return this.finish(enrolment.id, JourneyEnrolmentState.FAILED);
    }

    const rung = enrolment.journey.rungs.find((r) => r.rungIndex === payload.rungIndex);
    if (!rung) {
      return this.finish(enrolment.id, JourneyEnrolmentState.COMPLETED);
    }

    await this.prisma.journeyEnrolment.update({
      where: { id: enrolment.id },
      data: { rungExecCount: { increment: 1 }, lastRungAt: new Date(), state: JourneyEnrolmentState.ACTIVE },
    });

    const cfg = (rung.config && typeof rung.config === "object" ? rung.config : {}) as Record<string, unknown>;

    if (rung.type === "wait") {
      const minutes = Number(cfg.minutes) || 0;
      const resumeAt = new Date(Date.now() + minutes * 60_000);
      await this.advance(enrolment.id, payload.rungIndex);
      const nextIndex = payload.rungIndex + 1;
      if (!this.hasRung(enrolment.journey.rungs, nextIndex)) {
        return this.finish(enrolment.id, JourneyEnrolmentState.COMPLETED);
      }
      if (minutes <= MAX_INLINE_WAIT_MINUTES) {
        await this.prisma.journeyEnrolment.update({
          where: { id: enrolment.id },
          data: { state: JourneyEnrolmentState.WAITING, resumeAt },
        });
        await this.enqueueRung(enrolment.id, nextIndex, resumeAt);
      } else {
        // Long wait: park it for the cron sweep to resume.
        await this.prisma.journeyEnrolment.update({
          where: { id: enrolment.id },
          data: { state: JourneyEnrolmentState.WAITING, resumeAt },
        });
      }
      return { state: JourneyEnrolmentState.WAITING };
    }

    if (rung.type === "condition") {
      const pass = await this.evaluateCondition(enrolment.organizationId, enrolment.contactId, cfg);
      if (!pass) {
        return this.finish(enrolment.id, JourneyEnrolmentState.EXITED);
      }
      return this.advanceOrComplete(enrolment.id, payload.rungIndex, enrolment.journey.rungs);
    }

    // action
    await this.executeAction(enrolment.organizationId, enrolment.contactId, cfg);
    return this.advanceOrComplete(enrolment.id, payload.rungIndex, enrolment.journey.rungs);
  }

  private async evaluateCondition(
    organizationId: string,
    contactId: string,
    cfg: Record<string, unknown>,
  ): Promise<boolean> {
    switch (cfg.kind) {
      case "disposition": {
        const found = await this.prisma.disposition.findFirst({
          where: { organizationId, contactId, ...(cfg.code ? { code: String(cfg.code) } : {}) },
        });
        return Boolean(found);
      }
      case "answered": {
        const found = await this.prisma.questionResponse.findFirst({
          where: {
            organizationId,
            contactId,
            ...(cfg.questionId ? { questionId: String(cfg.questionId) } : {}),
          },
        });
        return Boolean(found);
      }
      default:
        return true;
    }
  }

  private async executeAction(
    organizationId: string,
    contactId: string,
    cfg: Record<string, unknown>,
  ): Promise<void> {
    switch (cfg.kind) {
      case "p2p_text":
        await this.singleSend.sendToContact(organizationId, contactId, String(cfg.body ?? ""));
        return;
      case "to_inbox":
        await this.prisma.conversationState.updateMany({
          where: { organizationId, contactId },
          data: { resolved: false },
        });
        this.events.emit("inbox.inbound", { contactId, source: "journey" });
        return;
      case "tag":
        // Tag storage lands with the contact-tags model; emit the trigger now so
        // tag-driven journeys still fire once tags are persisted.
        this.events.emit("journey.tag", { contactId, tag: String(cfg.tag ?? "") });
        return;
      case "door_task":
        // Door-task creation is wired with the canvassing domain (Phase 3).
        this.events.emit("journey.door_task", { contactId });
        return;
      default:
        this.logger.warn(`Unknown journey action kind: ${String(cfg.kind)}`);
    }
  }

  // ── Cron sweep for time-based rungs ─────────────────────────────
  async sweepDue(limit = 50): Promise<{ resumed: number }> {
    if (!this.isEnabled()) return { resumed: 0 };
    const bounded = Math.min(Math.max(1, Math.trunc(limit)), 100);
    const due = await this.prisma.journeyEnrolment.findMany({
      where: { state: JourneyEnrolmentState.WAITING, resumeAt: { lte: new Date() } },
      orderBy: { resumeAt: "asc" },
      take: bounded,
    });
    for (const enrolment of due) {
      await this.enqueueRung(enrolment.id, enrolment.currentRungIndex);
    }
    return { resumed: due.length };
  }

  // ── Helpers ─────────────────────────────────────────────────────
  private hasRung(rungs: { rungIndex: number }[], index: number): boolean {
    return rungs.some((r) => r.rungIndex === index);
  }

  private async advance(enrolmentId: string, fromIndex: number): Promise<void> {
    await this.prisma.journeyEnrolment.update({
      where: { id: enrolmentId },
      data: { currentRungIndex: fromIndex + 1 },
    });
  }

  private async advanceOrComplete(
    enrolmentId: string,
    fromIndex: number,
    rungs: { rungIndex: number }[],
  ): Promise<{ state: JourneyEnrolmentState }> {
    const nextIndex = fromIndex + 1;
    await this.advance(enrolmentId, fromIndex);
    if (!this.hasRung(rungs, nextIndex)) {
      return this.finish(enrolmentId, JourneyEnrolmentState.COMPLETED);
    }
    await this.enqueueRung(enrolmentId, nextIndex);
    return { state: JourneyEnrolmentState.ACTIVE };
  }

  private async finish(
    enrolmentId: string,
    state: JourneyEnrolmentState,
  ): Promise<{ state: JourneyEnrolmentState }> {
    await this.prisma.journeyEnrolment.update({
      where: { id: enrolmentId },
      data: { state, completedAt: new Date() },
    });
    this.events.emit("journey.enrolment.updated", { enrolmentId, state });
    return { state };
  }
}
