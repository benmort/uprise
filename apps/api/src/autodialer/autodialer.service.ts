import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DialerCampaignStatus, Prisma, type SupportLevel } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";
import { ApiHttpException } from "../common/http/api-response";
import { assertValidDialerCampaignTransition } from "./dialer-campaign-state.machine";
import {
  expandAuthoringFormat,
  validateQuestionGraph,
  type QuestionGraphIssue,
  type QuestionGraphNode,
} from "./question-graph.util";
import {
  CreateDialerCampaignDto,
  ListDialerCampaignsQueryDto,
  UpdateDialerCampaignDto,
  UpsertQuestionGraphDto,
} from "./dto/autodialer.dto";

/**
 * AU landline/mobile target validation, ported from the source's
 * `valid_phone_number` — transfer targets must be Australian numbers.
 */
export const AU_TARGET_NUMBER_REGEX = /^\+61[123478]\d{5,8}$/;
export function isValidAuTargetNumber(value: string): boolean {
  return AU_TARGET_NUMBER_REGEX.test(value);
}

/** One activation-gate check, admin-readable. */
export type DialerPreflightCheck = { key: string; ok: boolean; detail: string };
export type DialerPreflightResult = { ok: boolean; checks: DialerPreflightCheck[] };

/** Issue codes that would violate storage uniques — these block SAVING the
 *  graph; everything else (dangling, unreachable, cycles) is savable
 *  work-in-progress surfaced back to the editor. */
const GRAPH_SAVE_BLOCKERS = new Set(["DUPLICATE_KEY", "DUPLICATE_DIGIT", "INVALID_DIGIT", "EMPTY_GRAPH"]);

@Injectable()
export class AutodialerService {
  private readonly logger = new Logger(AutodialerService.name);
  private readonly outbox: Pick<OutboxService, "append">;
  private readonly flags: Pick<FeatureFlagsService, "isEnabled">;

  constructor(
    private readonly prisma: PrismaService,
    outbox?: OutboxService,
    flags?: FeatureFlagsService,
  ) {
    // Optional-with-fallback tail params (the blasts pattern) so unit specs can
    // construct positionally; DI supplies the real global services in production.
    this.outbox = outbox ?? { append: async () => {} };
    this.flags = flags ?? { isEnabled: async () => false };
  }

  /* ────────────────────────────── reads ────────────────────────────── */

  async list(tenantId: string, query: ListDialerCampaignsQueryDto) {
    const where: Prisma.DialerCampaignWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status as DialerCampaignStatus } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
      ...this.behaviourWhere(query.behaviour),
    };
    // ARCHIVED is hidden unless asked for explicitly.
    if (!query.status) where.status = { not: DialerCampaignStatus.ARCHIVED };

    const [campaigns, total] = await Promise.all([
      this.prisma.dialerCampaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.dialerCampaign.count({ where }),
    ]);
    return { campaigns, total };
  }

  private behaviourWhere(behaviour?: string): Prisma.DialerCampaignWhereInput {
    switch (behaviour) {
      case "broadcast":
        return { outboundOnly: true, survey: false, electoralTarget: false };
      case "survey":
        return { survey: true };
      case "electoral":
        return { electoralTarget: true };
      case "transfer":
        return {
          OR: [{ transparentTargetTransfer: true }, { targetNumbers: { not: Prisma.AnyNull } }],
        };
      default:
        return {};
    }
  }

  async get(tenantId: string, id: string) {
    const campaign = await this.prisma.dialerCampaign.findFirst({
      where: { id, tenantId },
      include: {
        questions: { orderBy: { orderIndex: "asc" }, include: { answers: { orderBy: { digit: "asc" } } } },
      },
    });
    if (!campaign) throw new NotFoundException("Campaign not found");
    return campaign;
  }

  /** The activation gate as a readable checklist (the admin Overview card). */
  async preflight(tenantId: string, id: string): Promise<DialerPreflightResult> {
    const campaign = await this.get(tenantId, id);
    const checks: DialerPreflightCheck[] = [];

    const flagOn = await this.flags.isEnabled("FEATURE_AUTODIALER_ENABLED", { tenantId });
    checks.push({
      key: "flag",
      ok: flagOn,
      detail: flagOn ? "Autodialer is enabled for this workspace." : "Autodialer is not enabled on this plan.",
    });

    const needsAudience = campaign.outboundOnly;
    checks.push({
      key: "audience",
      ok: !needsAudience || Boolean(campaign.audienceId),
      detail: needsAudience
        ? campaign.audienceId
          ? "Audience attached."
          : "An outbound campaign needs an audience to dial."
        : "Inbound-capable campaign – no audience required.",
    });

    const windowOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(campaign.dailyStart) && /^([01]\d|2[0-3]):[0-5]\d$/.test(campaign.dailyFinish);
    checks.push({
      key: "window",
      ok: windowOk,
      detail: windowOk
        ? `Calling window ${campaign.dailyStart}–${campaign.dailyFinish} (tenant timezone).`
        : "Calling window times are invalid.",
    });

    if (campaign.survey) {
      const graph = this.toGraph(campaign.questions);
      const issues = validateQuestionGraph(graph);
      const errors = issues.filter((i) => i.severity === "error");
      checks.push({
        key: "survey",
        ok: errors.length === 0,
        detail:
          errors.length === 0
            ? `Survey graph valid (${graph.length} question${graph.length === 1 ? "" : "s"}).`
            : `Survey graph has ${errors.length} blocking issue${errors.length === 1 ? "" : "s"}: ${errors[0].detail}`,
      });
    }

    if (campaign.electoralTarget) {
      checks.push({
        key: "jurisdiction",
        ok: Boolean(campaign.jurisdiction),
        detail: campaign.jurisdiction
          ? `Electoral targeting: ${campaign.jurisdiction}.`
          : "Electoral targeting needs a jurisdiction.",
      });
    }

    const targets = this.targetNumbers(campaign.targetNumbers);
    const transferIntent = campaign.transparentTargetTransfer && !campaign.electoralTarget;
    if (transferIntent) {
      checks.push({
        key: "targets",
        ok: targets.length > 0,
        detail: targets.length > 0 ? `${targets.length} transfer target(s).` : "A transfer campaign needs target numbers.",
      });
    }
    if (targets.length > 0) {
      const invalid = targets.filter((t) => !isValidAuTargetNumber(t));
      checks.push({
        key: "target-numbers",
        ok: invalid.length === 0,
        detail:
          invalid.length === 0
            ? "All target numbers are valid AU numbers."
            : `Invalid target number(s): ${invalid.join(", ")}`,
      });
    }

    return { ok: checks.every((c) => c.ok), checks };
  }

  /* ───────────────────────────── mutations ─────────────────────────── */

  async create(tenantId: string, dto: CreateDialerCampaignDto, createdById?: string) {
    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.dialerCampaign.create({
        data: {
          tenantId,
          name: dto.name,
          outboundOnly: dto.outboundOnly ?? false,
          survey: dto.survey ?? false,
          electoralTarget: dto.electoralTarget ?? false,
          transparentTargetTransfer: dto.transparentTargetTransfer ?? false,
          createdById: createdById ?? null,
        },
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "autodialer.campaign.created",
        aggregateId: campaign.id,
        payload: { campaignId: campaign.id, tenantId, name: campaign.name },
      });
      return campaign;
    });
  }

  async update(tenantId: string, id: string, dto: UpdateDialerCampaignDto) {
    const campaign = await this.get(tenantId, id);
    this.assertEditable(campaign.status);

    if (dto.targetNumbers) {
      const invalid = dto.targetNumbers.filter((t) => !isValidAuTargetNumber(t));
      if (invalid.length > 0) {
        throw new ApiHttpException(
          "INVALID_TARGET_NUMBER",
          `Target numbers must be AU E.164 (+61…): ${invalid.join(", ")}`,
          422,
        );
      }
    }

    const { targetNumbers, partyTargets, targetPoliticians, intro, outro, optOut, ...rest } = dto;
    return this.prisma.dialerCampaign.update({
      where: { id: campaign.id },
      data: {
        ...rest,
        ...(targetNumbers !== undefined ? { targetNumbers: targetNumbers ?? Prisma.DbNull } : {}),
        ...(partyTargets !== undefined ? { partyTargets: partyTargets ?? Prisma.DbNull } : {}),
        ...(targetPoliticians !== undefined
          ? {
              targetPoliticians:
                targetPoliticians === null
                  ? Prisma.DbNull
                  : (targetPoliticians.map((p) => ({
                      id: p.id,
                      name: p.name,
                      party: p.party ?? null,
                      electorate: p.electorate ?? null,
                    })) as Prisma.InputJsonValue),
            }
          : {}),
        ...(intro !== undefined ? { intro: (intro ?? Prisma.DbNull) as Prisma.InputJsonValue } : {}),
        ...(outro !== undefined ? { outro: (outro ?? Prisma.DbNull) as Prisma.InputJsonValue } : {}),
        ...(optOut !== undefined ? { optOut: (optOut ?? Prisma.DbNull) as Prisma.InputJsonValue } : {}),
      },
    });
  }

  /**
   * Full-graph replace. Rejects only what storage cannot hold (duplicate
   * keys/digits, invalid digits); dangling/unreachable/cycles are savable
   * work-in-progress returned as issues for the editor.
   */
  async upsertQuestionGraph(tenantId: string, id: string, dto: UpsertQuestionGraphDto) {
    const campaign = await this.get(tenantId, id);
    this.assertEditable(campaign.status);

    const graph: QuestionGraphNode[] = dto.authoring
      ? expandAuthoringFormat(dto.authoring)
      : (dto.questions ?? []).map((q) => ({
          key: q.key,
          name: q.name,
          type: q.type ?? "STANDARD",
          audioPrompt: q.audioPrompt,
          answers: q.answers.map((a) => ({
            digit: a.digit,
            value: a.value,
            nextKey: a.nextKey ?? null,
            type: a.type ?? null,
            content: a.content ?? null,
            transfer: a.transfer ?? false,
            dispositionCode: a.dispositionCode ?? null,
            supportLevel: a.supportLevel ?? null,
          })),
        }));

    const issues = validateQuestionGraph(graph);
    const blockers = issues.filter((i) => i.severity === "error" && GRAPH_SAVE_BLOCKERS.has(i.code));
    if (blockers.length > 0) {
      throw new ApiHttpException(
        "INVALID_QUESTION_GRAPH",
        blockers.map((b) => b.detail).join(" "),
        422,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.dialerAnswer.deleteMany({ where: { campaignId: campaign.id } });
      await tx.dialerQuestion.deleteMany({ where: { campaignId: campaign.id } });
      for (const [index, q] of graph.entries()) {
        const question = await tx.dialerQuestion.create({
          data: {
            tenantId,
            campaignId: campaign.id,
            key: q.key,
            name: q.name,
            type: q.type === "SWITCHBOARD" ? "SWITCHBOARD" : "STANDARD",
            audioPrompt: (q.audioPrompt ?? Prisma.DbNull) as Prisma.InputJsonValue,
            orderIndex: index,
          },
        });
        for (const a of q.answers) {
          await tx.dialerAnswer.create({
            data: {
              tenantId,
              campaignId: campaign.id,
              questionId: question.id,
              digit: a.digit,
              value: a.value,
              nextKey: a.nextKey,
              type: a.type ?? null,
              content: a.content ?? null,
              transfer: a.transfer ?? false,
              dispositionCode: a.dispositionCode ?? null,
              supportLevel: (a.supportLevel ?? null) as SupportLevel | null,
            },
          });
        }
      }
    });

    const saved = await this.get(tenantId, id);
    return { campaign: saved, issues };
  }

  async clone(tenantId: string, id: string, createdById?: string) {
    const source = await this.get(tenantId, id);
    return this.prisma.$transaction(async (tx) => {
      const copy = await tx.dialerCampaign.create({
        data: {
          tenantId,
          name: `${source.name} (copy)`,
          outboundOnly: source.outboundOnly,
          publicVisible: source.publicVisible,
          survey: source.survey,
          electoralTarget: source.electoralTarget,
          transparentTargetTransfer: source.transparentTargetTransfer,
          audienceId: source.audienceId,
          dailyStart: source.dailyStart,
          dailyFinish: source.dailyFinish,
          dialerPeriodMinutes: source.dialerPeriodMinutes,
          noCallWindowHours: source.noCallWindowHours,
          maxCallAttempts: source.maxCallAttempts,
          batchSize: source.batchSize,
          fromNumberId: source.fromNumberId,
          intro: (source.intro ?? Prisma.DbNull) as Prisma.InputJsonValue,
          outro: (source.outro ?? Prisma.DbNull) as Prisma.InputJsonValue,
          optOut: (source.optOut ?? Prisma.DbNull) as Prisma.InputJsonValue,
          targetNumbers: (source.targetNumbers ?? Prisma.DbNull) as Prisma.InputJsonValue,
          partyTargets: (source.partyTargets ?? Prisma.DbNull) as Prisma.InputJsonValue,
          jurisdiction: source.jurisdiction,
          officeTarget: source.officeTarget,
          amdEnabled: source.amdEnabled,
          recordingEnabled: source.recordingEnabled,
          defaultLanguage: source.defaultLanguage,
          createdById: createdById ?? null,
        },
      });
      for (const q of source.questions) {
        const question = await tx.dialerQuestion.create({
          data: {
            tenantId,
            campaignId: copy.id,
            key: q.key,
            name: q.name,
            type: q.type,
            audioPrompt: (q.audioPrompt ?? Prisma.DbNull) as Prisma.InputJsonValue,
            orderIndex: q.orderIndex,
          },
        });
        for (const a of q.answers) {
          await tx.dialerAnswer.create({
            data: {
              tenantId,
              campaignId: copy.id,
              questionId: question.id,
              digit: a.digit,
              value: a.value,
              nextKey: a.nextKey,
              type: a.type,
              content: a.content,
              transfer: a.transfer,
              dispositionCode: a.dispositionCode,
              supportLevel: a.supportLevel,
            },
          });
        }
      }
      await this.outbox.append(tx, {
        tenantId,
        eventType: "autodialer.campaign.created",
        aggregateId: copy.id,
        payload: { campaignId: copy.id, tenantId, name: copy.name },
      });
      return copy;
    });
  }

  async activate(tenantId: string, id: string) {
    const gate = await this.preflight(tenantId, id);
    if (!gate.ok) {
      const failing = gate.checks.filter((c) => !c.ok);
      throw new ApiHttpException(
        "PREFLIGHT_FAILED",
        failing.map((c) => c.detail).join(" "),
        422,
      );
    }
    return this.transition(tenantId, id, DialerCampaignStatus.ACTIVE, "autodialer.campaign.activated", (campaign) => ({
      startedAt: campaign.startedAt ?? new Date(),
    }));
  }

  async pause(tenantId: string, id: string) {
    return this.transition(tenantId, id, DialerCampaignStatus.PAUSED, "autodialer.campaign.paused");
  }

  /** Resume is activate-from-PAUSED — same preflight, same target state. */
  async resume(tenantId: string, id: string) {
    return this.activate(tenantId, id);
  }

  async complete(tenantId: string, id: string) {
    return this.transition(
      tenantId,
      id,
      DialerCampaignStatus.COMPLETED,
      "autodialer.campaign.completed",
      () => ({ completedAt: new Date() }),
      async (tx, campaign) => ({
        campaignId: campaign.id,
        tenantId,
        dialled: await tx.dialerAttempt.count({ where: { campaignId: campaign.id } }),
      }),
    );
  }

  async archive(tenantId: string, id: string) {
    return this.transition(tenantId, id, DialerCampaignStatus.ARCHIVED, "autodialer.campaign.archived");
  }

  /* ───────────────────────────── internals ─────────────────────────── */

  private assertEditable(status: DialerCampaignStatus): void {
    if (status !== DialerCampaignStatus.DRAFT && status !== DialerCampaignStatus.PAUSED) {
      throw new ApiHttpException(
        "CAMPAIGN_NOT_EDITABLE",
        `A ${status} campaign cannot be edited – pause it first.`,
        409,
      );
    }
  }

  /**
   * Lock + load + FSM-assert + write + outbox, in one transaction. The row is
   * locked `FOR UPDATE` so a concurrent engine tick and a manual transition
   * cannot both pass the stale-status guard (the payment lockAndLoad pattern).
   */
  private async transition(
    tenantId: string,
    id: string,
    to: DialerCampaignStatus,
    eventType:
      | "autodialer.campaign.activated"
      | "autodialer.campaign.paused"
      | "autodialer.campaign.completed"
      | "autodialer.campaign.archived",
    extraData?: (campaign: { id: string; startedAt: Date | null }) => Record<string, unknown>,
    payloadBuilder?: (
      tx: Prisma.TransactionClient,
      campaign: { id: string },
    ) => Promise<Record<string, unknown>>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM autodialer."DialerCampaign" WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`,
      );
      if (locked.length === 0) throw new NotFoundException("Campaign not found");
      const campaign = await tx.dialerCampaign.findUnique({ where: { id } });
      if (!campaign) throw new NotFoundException("Campaign not found");

      assertValidDialerCampaignTransition(campaign.status, to);

      const updated = await tx.dialerCampaign.update({
        where: { id },
        data: { status: to, ...(extraData ? extraData(campaign) : {}) },
      });
      const payload = payloadBuilder
        ? await payloadBuilder(tx, campaign)
        : { campaignId: campaign.id, tenantId };
      await this.outbox.append(tx, {
        tenantId,
        eventType,
        aggregateId: campaign.id,
        payload: payload as never,
      });
      return updated;
    });
  }

  private toGraph(
    questions: Array<{
      key: string;
      name: string;
      type: string;
      audioPrompt: unknown;
      answers: Array<{
        digit: string;
        value: string;
        nextKey: string | null;
        type: string | null;
        content: string | null;
        transfer: boolean;
        dispositionCode: string | null;
        supportLevel: string | null;
      }>;
    }>,
  ): QuestionGraphNode[] {
    return questions.map((q) => ({
      key: q.key,
      name: q.name,
      type: q.type === "SWITCHBOARD" ? "SWITCHBOARD" : "STANDARD",
      audioPrompt: q.audioPrompt,
      answers: q.answers.map((a) => ({
        digit: a.digit,
        value: a.value,
        nextKey: a.nextKey,
        type: (a.type ?? null) as never,
        content: a.content,
        transfer: a.transfer,
        dispositionCode: a.dispositionCode,
        supportLevel: a.supportLevel,
      })),
    }));
  }

  private targetNumbers(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
    if (typeof raw === "string" && raw) return [raw];
    return [];
  }
}
