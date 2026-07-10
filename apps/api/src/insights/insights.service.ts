import { Injectable } from "@nestjs/common";
import type { Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";
import type { AuthUser } from "../auth/auth-user";
import { cleanTitle, evidenceOf, groupQuestions, THEMES } from "./question-taxonomy";

/**
 * Read side of the Insights/Polling domain. Every query is scoped by
 * {@link InsightsService.visibilityWhere} — a poll is visible to a tenant when it
 * is theirs (tenantId matches) OR shared/global (tenantId null). Estimates
 * reference geo regions id-only by (geoKind, geoCode); this service never joins
 * PostGIS — it hands geo codes to the client/geo layer for rendering.
 */
// Shared by the authed and the public poll-detail reads — the questions + their whole-sample
// (Total/Total) toplines. Extracted so getPoll and getPublicPoll cannot drift apart.
const POLL_DETAIL_INCLUDE = {
  questions: {
    orderBy: { ordinal: "asc" },
    include: {
      estimates: {
        where: { breakdownGroup: "Total", breakdownValue: "Total" },
        orderBy: { responseOrdinal: "asc" },
        select: { responseLabel: true, percent: true, isNet: true, baseN: true, reportable: true },
      },
    },
  },
} satisfies Prisma.PollInclude;
type PollDetailRow = Prisma.PollGetPayload<{ include: typeof POLL_DETAIL_INCLUDE }>;

const QUESTION_DETAIL_INCLUDE = {
  poll: { select: { id: true, title: true, attribution: true } },
  estimates: { orderBy: [{ responseOrdinal: "asc" }, { breakdownOrdinal: "asc" }] },
} satisfies Prisma.PollQuestionInclude;
type QuestionDetailRow = Prisma.PollQuestionGetPayload<{ include: typeof QUESTION_DETAIL_INCLUDE }>;

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tenant-owned OR public OR shared/global — the single visibility gate for every read. */
  private visibilityWhere(tenantId: string): Prisma.PollWhereInput {
    return { OR: [{ tenantId }, { tenantId: null }, { isPublic: true }] };
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
      shared: p.tenantId === null || p.isPublic,
      questionCount: p._count.questions,
      lastIngestedAt: p.lastIngestedAt,
    }));
  }

  /**
   * Make a tenant-owned poll public (readable by every tenant) or private again.
   *
   * The route's `@RequirePermission(manage insights.poll)` restricts the ROLE — owner or
   * organiser (both hold `manage insights.all`), plus super-admins (who bypass CASL). This
   * enforces the tenant SCOPE: a non-super-admin may only toggle their OWN tenant's poll, so
   * one org can never publish another's (or flip the null-tenant global tier).
   *
   * `status` tracks visibility so the badge is truthful: public ⇒ PUBLISHED (stamping
   * `publishedAt` once), private ⇒ DRAFT. `status` is otherwise never transitioned, so without
   * this it would sit on the ingest default forever. Idempotent on the (isPublic, status) pair.
   */
  async setPollPublic(user: AuthUser, pollId: string, isPublic: boolean) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      select: { id: true, tenantId: true, isPublic: true, status: true, publishedAt: true },
    });
    if (!poll) throw new ApiHttpException("POLL_NOT_FOUND", "Poll not found");
    if (!user.isSuperAdmin && poll.tenantId !== user.tenantId) {
      throw new ApiHttpException("FORBIDDEN", "You can only change your own organisation's polls");
    }
    const status = isPublic ? "PUBLISHED" : "DRAFT";
    if (poll.isPublic !== isPublic || poll.status !== status) {
      await this.prisma.poll.update({
        where: { id: pollId },
        data: {
          isPublic,
          status,
          ...(isPublic && !poll.publishedAt ? { publishedAt: new Date() } : {}),
        },
      });
    }
    return { id: poll.id, isPublic, status, shared: poll.tenantId === null || isPublic };
  }

  /**
   * One poll + its provenance, key findings and question list.
   *
   * Each question carries its `topline` — the whole-sample column — so the overview can
   * chart the poll without a request per question. That is the `Total`/`Total` cell of
   * the crosstab, ~200 rows for a 36-question instrument; a breakdown (gender, region)
   * still costs a trip to {@link getPollQuestion}.
   *
   * Questions are grouped by {@link groupQuestions}: sibling blocks of one question
   * (`C1` "ranked first" + `C1-2` "ranked top 3") collapse to one row, and the sheet's
   * duplicated blocks disappear.
   */
  async getPoll(tenantId: string, id: string) {
    const poll = await this.prisma.poll.findFirst({
      where: { id, ...this.visibilityWhere(tenantId) },
      include: POLL_DETAIL_INCLUDE,
    });
    if (!poll) throw new ApiHttpException("POLL_NOT_FOUND", "Poll not found");
    return this.mapPollDetail(poll, tenantId);
  }

  /**
   * A poll for an UNAUTHENTICATED reader (the public `action` app). Only ever returns a poll
   * an owner/organiser has explicitly made public (`isPublic`); a private or global-tier poll
   * 404s exactly as a missing one would, so nothing leaks.
   */
  async getPublicPoll(id: string) {
    const poll = await this.prisma.poll.findFirst({
      where: { id, isPublic: true },
      include: { ...POLL_DETAIL_INCLUDE, tenant: { select: { name: true, slug: true } } },
    });
    if (!poll) throw new ApiHttpException("POLL_NOT_FOUND", "Poll not found");
    // The owning tenant brands the public page (name + slug for an initials avatar).
    return { ...this.mapPollDetail(poll, null), tenant: poll.tenant };
  }

  /** The choropleth cells for a public poll's question — unauthenticated, isPublic-only. */
  async getPublicChoropleth(pollId: string, code: string, response: string) {
    const question = await this.prisma.pollQuestion.findFirst({
      where: { pollId, code, poll: { isPublic: true } },
      select: { id: true, code: true, title: true },
    });
    if (!question) throw new ApiHttpException("QUESTION_NOT_FOUND", "Question not found");
    return this.choroplethFor(question, response);
  }

  /** Shape a loaded poll for the client. `actingTenantId` is null for public reads. */
  private mapPollDetail(poll: PollDetailRow, actingTenantId: string | null) {
    const questions = groupQuestions(
      poll.slug,
      poll.questions.map((q) => ({
        code: q.code,
        title: q.title,
        category: q.category,
        hasNet: q.hasNet,
        responseKind: q.responseKind,
        baseN: q.estimates[0]?.baseN ?? null,
        // A suppressed cell (baseN under the reportability threshold) publishes no
        // percentage — carry the null through rather than drawing it as zero.
        topline: q.estimates.map((e) => ({
          label: e.responseLabel,
          percent: e.reportable ? this.pctNum(e.percent) : null,
          isNet: e.isNet,
        })),
      })),
    );

    // Ship the theme catalogue with the keys it labels, in reading order, so the client
    // never keeps a second copy of the taxonomy that can drift from this one. Only the
    // themes actually present are sent; an unrecognised poll sends none.
    const used = new Set(questions.map((q) => q.theme));
    const themes = THEMES.filter((t) => used.has(t.key));

    // Attach the crosstabs that back each finding. The client computes every figure from
    // the estimates and compares it against the `claim` the write-up makes, so a number
    // the poll's own prose gets wrong is shown as a disagreement, not silently corrected.
    const keyFindings = ((poll.keyFindings ?? []) as Array<{ questionCode?: string }>).map((f) => ({
      ...f,
      evidence: evidenceOf(poll.slug, f.questionCode),
    }));

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
      keyFindings: keyFindings as unknown,
      status: poll.status,
      shared: poll.tenantId === null || poll.isPublic,
      isPublic: poll.isPublic,
      // Does the ACTING tenant own this poll? Drives whether the visibility toggle is offered
      // (a super-admin may toggle any poll regardless; the client adds that check). Always
      // false for a public reader (no acting tenant).
      owned: actingTenantId !== null && poll.tenantId === actingTenantId,
      themes,
      questions,
    };
  }

  /** A question's full crosstab, pivoted: ordered columns (grouped) + rows keyed by column ordinal. */
  async getPollQuestion(tenantId: string, pollId: string, code: string) {
    const question = await this.prisma.pollQuestion.findFirst({
      where: { pollId, code, poll: this.visibilityWhere(tenantId) },
      include: QUESTION_DETAIL_INCLUDE,
    });
    if (!question) throw new ApiHttpException("QUESTION_NOT_FOUND", "Question not found");
    return this.mapCrosstab(question);
  }

  /** A question's crosstab for an UNAUTHENTICATED reader — the question's poll must be public. */
  async getPublicPollQuestion(pollId: string, code: string) {
    const question = await this.prisma.pollQuestion.findFirst({
      where: { pollId, code, poll: { isPublic: true } },
      include: QUESTION_DETAIL_INCLUDE,
    });
    if (!question) throw new ApiHttpException("QUESTION_NOT_FOUND", "Question not found");
    return this.mapCrosstab(question);
  }

  /** Pivot a loaded question's estimates into ordered columns (grouped) + response rows. */
  private mapCrosstab(question: QuestionDetailRow) {
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
      question: {
        code: question.code,
        // Present the human question, not the raw sheet header ("C5. … by BANNER COMMON THREADS").
        title: cleanTitle(question.title, question.code),
        category: question.category,
        hasNet: question.hasNet,
      },
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
    return this.choroplethFor(question, response);
  }

  /** Shared by the authed + public choropleth reads: the geographic cells for a question/response. */
  private async choroplethFor(question: { id: string; code: string; title: string }, response: string) {
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
        q = { code: r.question.code, title: cleanTitle(r.question.title, r.question.code), ordinal: r.question.ordinal, rows: [] };
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
