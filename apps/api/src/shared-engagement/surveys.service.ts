import { randomUUID } from "node:crypto";
import { Injectable, HttpStatus } from "@nestjs/common";
import { Prisma, QuestionType, SupportLevel } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";

export type SurveyOptionInput = {
  value: string;
  label: string;
  orderIndex?: number;
  dispositionCode?: string | null;
  supportLevel?: SupportLevel | null;
  cannedReplyText?: string | null;
  nextQuestionKey?: string | null;
  isTerminal?: boolean;
};

export type SurveyQuestionInput = {
  key?: string;
  prompt: string;
  type: QuestionType;
  orderIndex?: number;
  required?: boolean;
  scaleMin?: number | null;
  scaleMax?: number | null;
  defaultNextQuestionKey?: string | null;
  options?: SurveyOptionInput[];
};

type SurveyFlowInput = { entryQuestionKey?: string | null; opensAfterDisposition?: boolean };

@Injectable()
export class SurveysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const surveys = await this.prisma.survey.findMany({
      where: { tenantId, isArchived: false },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { questions: true } } },
    });
    // A survey can be bound to MANY canvass campaigns (ContentBinding). The door app
    // resolves its survey by "is this survey bound to my campaign", so expose the full
    // list — the legacy single-valued Survey.campaignId can't represent reuse.
    const bindings = await this.prisma.contentBinding.findMany({
      where: { tenantId, contentType: "SURVEY", objectType: "CANVASS_CAMPAIGN" },
      select: { contentId: true, objectId: true },
    });
    const campaignsBySurvey = new Map<string, string[]>();
    for (const b of bindings) {
      const list = campaignsBySurvey.get(b.contentId) ?? [];
      list.push(b.objectId);
      campaignsBySurvey.set(b.contentId, list);
    }
    return surveys.map((s) => ({
      id: s.id,
      name: s.name,
      campaignId: s.campaignId,
      campaignIds: campaignsBySurvey.get(s.id) ?? [],
      questionCount: s._count.questions,
      updatedAt: s.updatedAt,
    }));
  }

  async get(tenantId: string, id: string) {
    const survey = await this.prisma.survey.findFirst({
      where: { id, tenantId },
      include: {
        questions: {
          orderBy: { orderIndex: "asc" },
          include: { options: { orderBy: { orderIndex: "asc" } } },
        },
      },
    });
    if (!survey) throw new ApiHttpException("SURVEY_NOT_FOUND", "Survey not found", HttpStatus.NOT_FOUND);
    return survey;
  }

  async create(tenantId: string, input: { name: string; questions?: SurveyQuestionInput[] } & SurveyFlowInput) {
    return this.prisma.survey.create({
      data: {
        tenantId,
        name: input.name,
        entryQuestionKey: input.entryQuestionKey ?? null,
        ...(input.opensAfterDisposition !== undefined ? { opensAfterDisposition: input.opensAfterDisposition } : {}),
        questions: input.questions ? { create: input.questions.map(questionCreate) } : undefined,
      },
      include: { questions: { orderBy: { orderIndex: "asc" }, include: { options: { orderBy: { orderIndex: "asc" } } } } },
    });
  }

  async update(
    tenantId: string,
    id: string,
    input: { name?: string; questions?: SurveyQuestionInput[] } & SurveyFlowInput,
  ) {
    const existing = await this.prisma.survey.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new ApiHttpException("SURVEY_NOT_FOUND", "Survey not found", HttpStatus.NOT_FOUND);
    return this.prisma.$transaction(async (tx) => {
      await tx.survey.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.entryQuestionKey !== undefined ? { entryQuestionKey: input.entryQuestionKey } : {}),
          ...(input.opensAfterDisposition !== undefined ? { opensAfterDisposition: input.opensAfterDisposition } : {}),
        },
      });
      if (input.questions) {
        // Reconcile in place — keeps ids stable so collected QuestionResponses survive.
        await reconcileQuestions(tx, id, input.questions);
      }
      return tx.survey.findUnique({
        where: { id },
        include: { questions: { orderBy: { orderIndex: "asc" }, include: { options: { orderBy: { orderIndex: "asc" } } } } },
      });
    });
  }

  async archive(tenantId: string, id: string) {
    const existing = await this.prisma.survey.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new ApiHttpException("SURVEY_NOT_FOUND", "Survey not found", HttpStatus.NOT_FOUND);
    await this.prisma.survey.update({ where: { id }, data: { isArchived: true } });
    return { archived: true };
  }
}

// Scalar row data for one option (shared by create + reconcile).
function optionData(o: SurveyOptionInput, i: number) {
  return {
    value: o.value,
    label: o.label,
    orderIndex: o.orderIndex ?? i,
    dispositionCode: o.dispositionCode ?? null,
    supportLevel: o.supportLevel ?? null,
    cannedReplyText: o.cannedReplyText ?? null,
    nextQuestionKey: o.nextQuestionKey ?? null,
    isTerminal: o.isTerminal ?? false,
  };
}

// Scalar row data for one question. `key` is the stable branch-edge identifier —
// generated when the client didn't supply one (edges just can't target it then).
function questionData(q: SurveyQuestionInput, key: string) {
  return {
    key,
    prompt: q.prompt,
    type: q.type,
    orderIndex: q.orderIndex ?? 0,
    required: q.required ?? false,
    scaleMin: q.scaleMin ?? null,
    scaleMax: q.scaleMax ?? null,
    defaultNextQuestionKey: q.defaultNextQuestionKey ?? null,
  };
}

// Build the nested Prisma create for one question (+ its options) — the create() path.
function questionCreate(q: SurveyQuestionInput): Prisma.QuestionCreateWithoutSurveyInput {
  return {
    ...questionData(q, q.key || randomUUID()),
    options: q.options ? { create: q.options.map(optionData) } : undefined,
  };
}

// Reconcile a question's options by stable `value`: update kept rows IN PLACE (so a
// QuestionResponse.optionId keeps pointing at the same row), create new, delete removed
// (a removed option SetNulls its responses' optionId — the row survives).
async function reconcileOptions(
  tx: Prisma.TransactionClient,
  questionId: string,
  options: SurveyOptionInput[] | undefined,
): Promise<void> {
  const opts = options ?? [];
  const existing = await tx.questionOption.findMany({ where: { questionId }, select: { id: true, value: true } });
  const byValue = new Map(existing.map((o) => [o.value, o.id]));
  const incoming = new Set(opts.map((o) => o.value));
  const removed = existing.filter((o) => !incoming.has(o.value)).map((o) => o.id);
  if (removed.length) await tx.questionOption.deleteMany({ where: { id: { in: removed } } });
  for (const [i, o] of opts.entries()) {
    const data = optionData(o, i);
    const existingId = byValue.get(o.value);
    if (existingId) await tx.questionOption.update({ where: { id: existingId }, data });
    else await tx.questionOption.create({ data: { questionId, ...data } });
  }
}

// Reconcile a survey's questions by stable `key`: UPDATE matched rows in place (so their
// QuestionResponse rows survive — no cascade), CREATE new, DELETE only removed. This
// replaces the old delete-all-then-recreate, which cascade-deleted every collected answer.
async function reconcileQuestions(
  tx: Prisma.TransactionClient,
  surveyId: string,
  incoming: SurveyQuestionInput[],
): Promise<void> {
  const withKeys = incoming.map((q) => ({ q, key: q.key || randomUUID() }));
  const existing = await tx.question.findMany({ where: { surveyId }, select: { id: true, key: true } });
  const byKey = new Map(existing.map((q) => [q.key, q.id]));
  const incomingKeys = new Set(withKeys.map((w) => w.key));
  const removed = existing.filter((q) => !incomingKeys.has(q.key)).map((q) => q.id);
  if (removed.length) await tx.question.deleteMany({ where: { id: { in: removed } } });
  for (const { q, key } of withKeys) {
    const existingId = byKey.get(key);
    if (existingId) {
      await tx.question.update({ where: { id: existingId }, data: questionData(q, key) });
      await reconcileOptions(tx, existingId, q.options);
    } else {
      const created = await tx.question.create({ data: { surveyId, ...questionData(q, key) } });
      await reconcileOptions(tx, created.id, q.options);
    }
  }
}
