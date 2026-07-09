import { Injectable } from "@nestjs/common";
import type { Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";

/**
 * Read side of the Insights/Polling domain. Every query is scoped by
 * {@link InsightsService.visibilityWhere} — a poll is visible to a tenant when it
 * is theirs (tenantId matches) OR shared/global (tenantId null). Estimates
 * reference geo regions id-only by (geoKind, geoCode); this service never joins
 * PostGIS — it hands geo codes to the client/geo layer for rendering.
 */
@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tenant-owned OR shared/global — the single visibility gate for every read. */
  private visibilityWhere(tenantId: string): Prisma.PollWhereInput {
    return { OR: [{ tenantId }, { tenantId: null }] };
  }

  private pctNum(p: Prisma.Decimal | null): number | null {
    return p == null ? null : Number(p);
  }

  /** Every poll the tenant may see (their own + shared), newest fieldwork first. */
  async listPolls(tenantId: string) {
    const polls = await this.prisma.poll.findMany({
      where: this.visibilityWhere(tenantId),
      orderBy: [{ fieldworkEnd: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { questions: true } } },
    });
    return polls.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      source: p.source,
      commissioner: p.commissioner,
      sampleSize: p.sampleSize,
      fieldworkStart: p.fieldworkStart,
      fieldworkEnd: p.fieldworkEnd,
      weighted: p.weighted,
      geoScope: p.geoScope,
      status: p.status,
      attribution: p.attribution,
      shared: p.tenantId === null,
      questionCount: p._count.questions,
      lastIngestedAt: p.lastIngestedAt,
    }));
  }

  /** One poll + its provenance, key findings and question list (grouped by category). */
  async getPoll(tenantId: string, id: string) {
    const poll = await this.prisma.poll.findFirst({
      where: { id, ...this.visibilityWhere(tenantId) },
      include: { questions: { orderBy: { ordinal: "asc" } } },
    });
    if (!poll) throw new ApiHttpException("POLL_NOT_FOUND", "Poll not found");
    return {
      id: poll.id,
      slug: poll.slug,
      title: poll.title,
      source: poll.source,
      commissioner: poll.commissioner,
      fieldworkStart: poll.fieldworkStart,
      fieldworkEnd: poll.fieldworkEnd,
      sampleSize: poll.sampleSize,
      methodology: poll.methodology,
      geoScope: poll.geoScope,
      weighted: poll.weighted,
      licence: poll.licence,
      attribution: poll.attribution,
      keyFindings: (poll.keyFindings ?? []) as unknown,
      status: poll.status,
      shared: poll.tenantId === null,
      questions: poll.questions.map((q) => ({
        code: q.code,
        title: q.title,
        category: q.category,
        hasNet: q.hasNet,
        responseKind: q.responseKind,
      })),
    };
  }

  /** A question's full crosstab, pivoted: ordered columns (grouped) + rows keyed by column ordinal. */
  async getPollQuestion(tenantId: string, pollId: string, code: string) {
    const question = await this.prisma.pollQuestion.findFirst({
      where: { pollId, code, poll: this.visibilityWhere(tenantId) },
      include: {
        poll: { select: { id: true, title: true, attribution: true } },
        estimates: { orderBy: [{ responseOrdinal: "asc" }, { breakdownOrdinal: "asc" }] },
      },
    });
    if (!question) throw new ApiHttpException("QUESTION_NOT_FOUND", "Question not found");

    // Columns (unique by ordinal), preserving source order + group runs.
    const colByOrd = new Map<
      number,
      { ordinal: number; group: string; value: string; geoKind: string | null; geoCode: string | null; baseN: number | null; reportable: boolean }
    >();
    const responseByOrd = new Map<number, { label: string; ordinal: number; isNet: boolean; cells: Record<number, number | null> }>();
    for (const e of question.estimates) {
      if (!colByOrd.has(e.breakdownOrdinal)) {
        colByOrd.set(e.breakdownOrdinal, {
          ordinal: e.breakdownOrdinal,
          group: e.breakdownGroup,
          value: e.breakdownValue,
          geoKind: e.geoKind,
          geoCode: e.geoCode,
          baseN: e.baseN,
          reportable: e.reportable,
        });
      }
      let r = responseByOrd.get(e.responseOrdinal);
      if (!r) {
        r = { label: e.responseLabel, ordinal: e.responseOrdinal, isNet: e.isNet, cells: {} };
        responseByOrd.set(e.responseOrdinal, r);
      }
      r.cells[e.breakdownOrdinal] = this.pctNum(e.percent);
    }
    const columns = [...colByOrd.values()].sort((a, b) => a.ordinal - b.ordinal);
    const groups: Array<{ group: string; columns: typeof columns }> = [];
    for (const col of columns) {
      const last = groups[groups.length - 1];
      if (last && last.group === col.group) last.columns.push(col);
      else groups.push({ group: col.group, columns: [col] });
    }
    const responses = [...responseByOrd.values()].sort((a, b) => a.ordinal - b.ordinal);

    return {
      poll: question.poll,
      question: { code: question.code, title: question.title, category: question.category, hasNet: question.hasNet },
      groups,
      responses,
    };
  }

  /** The geographic cells for one question/response — the choropleth payload (8 sed_upper rows). */
  async getChoropleth(tenantId: string, pollId: string, code: string, response: string) {
    const question = await this.prisma.pollQuestion.findFirst({
      where: { pollId, code, poll: this.visibilityWhere(tenantId) },
      select: { id: true, code: true, title: true },
    });
    if (!question) throw new ApiHttpException("QUESTION_NOT_FOUND", "Question not found");
    const rows = await this.prisma.pollEstimate.findMany({
      where: { questionId: question.id, responseLabel: response, geoKind: { not: null } },
      orderBy: { breakdownOrdinal: "asc" },
    });
    return {
      question: { code: question.code, title: question.title },
      response,
      cells: rows.map((r) => ({
        geoKind: r.geoKind,
        geoCode: r.geoCode,
        breakdownValue: r.breakdownValue,
        percent: this.pctNum(r.percent),
        baseN: r.baseN,
        reportable: r.reportable,
      })),
    };
  }

  /**
   * Everything visible polls know about one geo region — the region's cell vs the
   * statewide Total, per poll/question. Powers the on-electorate `<RegionPolling>`
   * panel. Returns an empty `polls` array when the region has no estimates.
   */
  async getRegionPolling(tenantId: string, geoKind: string, geoCode: string) {
    const regionRows = await this.prisma.pollEstimate.findMany({
      where: { geoKind, geoCode, poll: this.visibilityWhere(tenantId) },
      include: {
        poll: { select: { id: true, title: true, attribution: true } },
        question: { select: { id: true, code: true, title: true, ordinal: true } },
      },
      orderBy: [{ responseOrdinal: "asc" }],
    });
    if (regionRows.length === 0) return { region: { geoKind, geoCode }, polls: [] };

    // The matching Total column per question, for a "vs statewide" comparison.
    const questionIds = [...new Set(regionRows.map((r) => r.questionId))];
    const totals = await this.prisma.pollEstimate.findMany({
      where: { questionId: { in: questionIds }, breakdownGroup: "Total" },
      select: { questionId: true, responseLabel: true, percent: true },
    });
    const totalMap = new Map(totals.map((t) => [`${t.questionId}|${t.responseLabel}`, this.pctNum(t.percent)]));

    type Row = { responseLabel: string; isNet: boolean; regionPercent: number | null; totalPercent: number | null };
    const polls = new Map<string, { pollId: string; title: string; attribution: string | null; questions: Map<string, { code: string; title: string; ordinal: number; rows: Row[] }> }>();
    for (const r of regionRows) {
      let p = polls.get(r.poll.id);
      if (!p) {
        p = { pollId: r.poll.id, title: r.poll.title, attribution: r.poll.attribution, questions: new Map() };
        polls.set(r.poll.id, p);
      }
      let q = p.questions.get(r.question.code);
      if (!q) {
        q = { code: r.question.code, title: r.question.title, ordinal: r.question.ordinal, rows: [] };
        p.questions.set(r.question.code, q);
      }
      q.rows.push({
        responseLabel: r.responseLabel,
        isNet: r.isNet,
        regionPercent: this.pctNum(r.percent),
        totalPercent: totalMap.get(`${r.questionId}|${r.responseLabel}`) ?? null,
      });
    }
    return {
      region: { geoKind, geoCode },
      polls: [...polls.values()].map((p) => ({
        pollId: p.pollId,
        title: p.title,
        attribution: p.attribution,
        questions: [...p.questions.values()].sort((a, b) => a.ordinal - b.ordinal),
      })),
    };
  }

  /**
   * Resolve a poll threshold to a set of geo codes — the shared basis for targeting
   * (a segment clause and "cut turf from electorates above X%"). Visibility-gated.
   */
  async resolvePollThresholdToGeoCodes(
    tenantId: string,
    input: { pollId: string; questionCode: string; response: string; op: ">" | ">=" | "<" | "<=" | "="; value: number; geoKind: string },
  ): Promise<string[]> {
    const question = await this.prisma.pollQuestion.findFirst({
      where: { pollId: input.pollId, code: input.questionCode, poll: this.visibilityWhere(tenantId) },
      select: { id: true },
    });
    if (!question) return [];
    const rows = await this.prisma.pollEstimate.findMany({
      where: { questionId: question.id, responseLabel: input.response, geoKind: input.geoKind, percent: { not: null } },
      select: { geoCode: true, percent: true },
    });
    const cmp = (a: number, b: number) =>
      input.op === ">" ? a > b : input.op === ">=" ? a >= b : input.op === "<" ? a < b : input.op === "<=" ? a <= b : a === b;
    return rows
      .filter((r) => r.geoCode && r.percent != null && cmp(Number(r.percent), input.value))
      .map((r) => r.geoCode as string);
  }
}
