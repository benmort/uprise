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
};

export type SurveyQuestionInput = {
  prompt: string;
  type: QuestionType;
  orderIndex?: number;
  required?: boolean;
  scaleMin?: number | null;
  scaleMax?: number | null;
  options?: SurveyOptionInput[];
};

@Injectable()
export class SurveysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const surveys = await this.prisma.survey.findMany({
      where: { tenantId, isArchived: false },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { questions: true } } },
    });
    return surveys.map((s) => ({
      id: s.id,
      name: s.name,
      campaignId: s.campaignId,
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

  async create(tenantId: string, input: { name: string; questions?: SurveyQuestionInput[] }) {
    return this.prisma.survey.create({
      data: {
        tenantId,
        name: input.name,
        questions: input.questions ? { create: input.questions.map(questionCreate) } : undefined,
      },
      include: { questions: { include: { options: true } } },
    });
  }

  async update(
    tenantId: string,
    id: string,
    input: { name?: string; questions?: SurveyQuestionInput[] },
  ) {
    const existing = await this.prisma.survey.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new ApiHttpException("SURVEY_NOT_FOUND", "Survey not found", HttpStatus.NOT_FOUND);
    return this.prisma.$transaction(async (tx) => {
      await tx.survey.update({
        where: { id },
        data: { ...(input.name !== undefined ? { name: input.name } : {}) },
      });
      if (input.questions) {
        // Replace the question set transactionally (cascades delete options).
        await tx.question.deleteMany({ where: { surveyId: id } });
        for (const q of input.questions) {
          await tx.question.create({ data: { surveyId: id, ...questionCreate(q) } });
        }
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

// Build the nested Prisma create for one question (+ its options).
function questionCreate(q: SurveyQuestionInput): Prisma.QuestionCreateWithoutSurveyInput {
  return {
    prompt: q.prompt,
    type: q.type,
    orderIndex: q.orderIndex ?? 0,
    required: q.required ?? false,
    scaleMin: q.scaleMin ?? null,
    scaleMax: q.scaleMax ?? null,
    options: q.options
      ? {
          create: q.options.map((o, i) => ({
            value: o.value,
            label: o.label,
            orderIndex: o.orderIndex ?? i,
            dispositionCode: o.dispositionCode ?? null,
            supportLevel: o.supportLevel ?? null,
            cannedReplyText: o.cannedReplyText ?? null,
          })),
        }
      : undefined,
  };
}
