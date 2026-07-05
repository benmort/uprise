import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  Disposition,
  DispositionLayer,
  EngagementChannel,
  JourneyTriggerType,
  QuestionResponse,
} from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeEventsService } from "../common/events/realtime-events.service";
import { ApiHttpException } from "../common/http/api-response";
import {
  JOURNEY_TRIGGER_PORT,
  JourneyTriggerPayload,
  JourneyTriggerPort,
} from "../journeys/journey-trigger.port";
import { CannedResponsesService } from "./canned-responses.service";
import { DEFAULT_DISPOSITIONS } from "./engagement-defaults";

export type RecordDispositionInput = {
  contactId: string;
  code: string;
  channel: EngagementChannel;
  campaignId?: string | null;
  blastId?: string | null;
  scriptStepId?: string | null;
  cannedResponseId?: string | null;
  supportLevel?: Disposition["supportLevel"];
  recordedById?: string | null;
};

export type RecordSurveyAnswerInput = {
  contactId: string;
  questionId: string;
  optionId?: string | null;
  valueText?: string | null;
  channel: EngagementChannel;
  campaignId?: string | null;
  blastId?: string | null;
  recordedById?: string | null;
};

/**
 * Cross-cutting orchestrator for the shared engagement layer. Door UI and SMS
 * inbox both record through here so a survey answer always writes a structured
 * response (and a disposition when the option maps one) — no silent data drops.
 */
@Injectable()
export class EngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: RealtimeEventsService,
    private readonly canned: CannedResponsesService,
    @Optional() @Inject(JOURNEY_TRIGGER_PORT) private readonly journeys?: JourneyTriggerPort,
  ) {}

  /**
   * Idempotently seed the system-default disposition taxonomy (tenantId
   * null). Uses find-then-create rather than upsert: a compound unique with a
   * null tenantId is unreliable to target (Postgres treats nulls as
   * distinct), so we match on (tenantId IS NULL, code) explicitly.
   */
  async ensureDefaultDispositions(): Promise<void> {
    for (const def of DEFAULT_DISPOSITIONS) {
      const existing = await this.prisma.dispositionDef.findFirst({
        where: { tenantId: null, code: def.code },
      });
      if (existing) {
        await this.prisma.dispositionDef.update({
          where: { id: existing.id },
          data: {
            label: def.label,
            layer: def.layer,
            channel: def.channel,
            isTerminal: def.isTerminal,
            isLocked: def.isLocked,
            orderIndex: def.orderIndex,
          },
        });
        continue;
      }
      await this.prisma.dispositionDef.create({ data: { ...def, tenantId: null } });
    }
  }

  /** Disposition catalog for an org: system defaults + the org's own, channel-filtered. */
  async listDispositionDefs(tenantId: string, channel?: EngagementChannel) {
    return this.prisma.dispositionDef.findMany({
      where: {
        OR: [{ tenantId: null }, { tenantId }],
        ...(channel ? { channel: { in: [channel, EngagementChannel.BOTH] } } : {}),
      },
      orderBy: { orderIndex: "asc" },
    });
  }

  /** Reject edits/deletes to locked (system terminal) disposition defs. */
  async assertDefEditable(tenantId: string, defId: string): Promise<void> {
    const def = await this.prisma.dispositionDef.findUnique({ where: { id: defId } });
    if (!def || (def.tenantId !== tenantId)) {
      throw new ApiHttpException("DISPOSITION_NOT_FOUND", "Disposition not found or is a shared system default");
    }
    if (def.isLocked) {
      throw new ApiHttpException("DISPOSITION_LOCKED", "This disposition is a locked system default and cannot be changed");
    }
  }

  /** Create an org-defined contact-result disposition. Terminal/data-quality codes are system-locked. */
  async createDispositionDef(
    tenantId: string,
    input: { code: string; label: string; channel?: EngagementChannel; orderIndex?: number },
  ) {
    const last = await this.prisma.dispositionDef.findFirst({
      where: { tenantId },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    return this.prisma.dispositionDef.create({
      data: {
        tenantId,
        code: input.code,
        label: input.label,
        layer: DispositionLayer.CONTACT_RESULT,
        channel: input.channel ?? EngagementChannel.BOTH,
        isTerminal: false,
        isLocked: false,
        orderIndex: input.orderIndex ?? (last ? last.orderIndex + 10 : 500),
      },
    });
  }

  async updateDispositionDef(
    tenantId: string,
    defId: string,
    input: { label?: string; channel?: EngagementChannel; orderIndex?: number },
  ) {
    await this.assertDefEditable(tenantId, defId);
    return this.prisma.dispositionDef.update({
      where: { id: defId },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.channel !== undefined ? { channel: input.channel } : {}),
        ...(input.orderIndex !== undefined ? { orderIndex: input.orderIndex } : {}),
      },
    });
  }

  async deleteDispositionDef(tenantId: string, defId: string) {
    await this.assertDefEditable(tenantId, defId);
    await this.prisma.dispositionDef.delete({ where: { id: defId } });
    return { deleted: true };
  }

  async recordDisposition(tenantId: string, input: RecordDispositionInput): Promise<Disposition> {
    const layer = await this.resolveLayer(tenantId, input.code);
    const disposition = await this.prisma.disposition.create({
      data: {
        tenantId,
        contactId: input.contactId,
        code: input.code,
        layer,
        channel: input.channel,
        campaignId: input.campaignId ?? null,
        blastId: input.blastId ?? null,
        scriptStepId: input.scriptStepId ?? null,
        cannedResponseId: input.cannedResponseId ?? null,
        supportLevel: input.supportLevel ?? null,
        recordedById: input.recordedById ?? null,
      },
    });
    this.events.emit("engagement.disposition", tenantId, {
      contactId: input.contactId,
      code: input.code,
      channel: input.channel,
    });
    await this.fireTrigger(JourneyTriggerType.disposition_set, {
      tenantId,
      contactId: input.contactId,
      code: input.code,
    });
    return disposition;
  }

  /**
   * Record a survey answer and, when the chosen option maps a disposition,
   * record that disposition in the same transaction.
   */
  async recordSurveyAnswer(
    tenantId: string,
    input: RecordSurveyAnswerInput,
  ): Promise<QuestionResponse> {
    const option = input.optionId
      ? await this.prisma.questionOption.findUnique({ where: { id: input.optionId } })
      : null;

    const response = await this.prisma.$transaction(async (tx) => {
      const created = await tx.questionResponse.create({
        data: {
          tenantId,
          contactId: input.contactId,
          questionId: input.questionId,
          optionId: input.optionId ?? null,
          valueText: input.valueText ?? null,
          channel: input.channel,
          campaignId: input.campaignId ?? null,
          blastId: input.blastId ?? null,
          recordedById: input.recordedById ?? null,
        },
      });

      if (option?.dispositionCode) {
        const layer = await this.resolveLayer(tenantId, option.dispositionCode);
        await tx.disposition.create({
          data: {
            tenantId,
            contactId: input.contactId,
            code: option.dispositionCode,
            layer,
            channel: input.channel,
            campaignId: input.campaignId ?? null,
            blastId: input.blastId ?? null,
            supportLevel: option.supportLevel ?? null,
            recordedById: input.recordedById ?? null,
          },
        });
      }
      return created;
    });

    this.events.emit("engagement.answer", tenantId, {
      contactId: input.contactId,
      questionId: input.questionId,
      channel: input.channel,
    });
    await this.fireTrigger(JourneyTriggerType.survey_answer, {
      tenantId,
      contactId: input.contactId,
      questionId: input.questionId,
      optionId: input.optionId ?? null,
    });
    return response;
  }

  /**
   * Resolve a canned reply's body for sending and log its mapped disposition.
   * Returns the body the caller should send; the disposition is recorded here.
   */
  async useCannedResponse(
    tenantId: string,
    input: { cannedResponseId: string; contactId: string; channel: EngagementChannel; recordedById?: string | null },
  ): Promise<{ body: string; disposition: Disposition | null }> {
    const canned = await this.canned.getById(tenantId, input.cannedResponseId);
    if (!canned) {
      throw new ApiHttpException("CANNED_RESPONSE_NOT_FOUND", "Canned response not found");
    }
    let disposition: Disposition | null = null;
    if (canned.dispositionCode) {
      disposition = await this.recordDisposition(tenantId, {
        contactId: input.contactId,
        code: canned.dispositionCode,
        channel: input.channel,
        cannedResponseId: canned.id,
        recordedById: input.recordedById ?? null,
      });
    }
    return { body: canned.body, disposition };
  }

  private async resolveLayer(tenantId: string, code: string): Promise<DispositionLayer> {
    const def = await this.prisma.dispositionDef.findFirst({
      where: { code, OR: [{ tenantId: null }, { tenantId }] },
    });
    return def?.layer ?? DispositionLayer.CONTACT_RESULT;
  }

  /**
   * Fire a journey trigger via the injected port. Optional so engagement has no
   * hard dependency on the journeys module (and unit tests need no journeys
   * mock); when journeys is wired, dispositions and survey answers enrol contacts.
   */
  private async fireTrigger(type: JourneyTriggerType, payload: JourneyTriggerPayload): Promise<void> {
    if (!this.journeys) return;
    try {
      await this.journeys.handleTrigger(type, payload);
    } catch (error) {
      // A journey failure must never break the engagement write that triggered it.
      this.events.emit("journey.trigger_error", payload.tenantId, { type, error: String(error) });
    }
  }
}
