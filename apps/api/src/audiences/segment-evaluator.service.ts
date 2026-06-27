import { Injectable, NotFoundException } from "@nestjs/common";
import { ConsentState, MessageChannel } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { DomainLogger } from "../common/logging/domain-logger.service";

type Clause = Record<string, unknown>;

/**
 * Dynamic-segment evaluator (meld doc 10) — the uprise port of prog's
 * `segment-evaluation.handler.ts`. Resolves which Contacts belong to an
 * `AudienceSegment` from its `definition` rule and **wholesale-rewrites**
 * `AudienceSegmentMember` so every evaluation is authoritative (stale members
 * dropped).
 *
 * Clause types:
 *   prog-native  — `{ type: 'emailDomain', domain }`, `{ type: 'hasSource', sourceSystem }`,
 *                  `{ type: 'all' }`
 *   uprise-native — `{ type: 'consentState', channel, state }`, `{ type: 'turf', turfId }`
 *   combinators  — `{ all: [clause, …] }` (intersection), `{ any: [clause, …] }` (union)
 *
 * Like prog, an `{ include: {...} }` wrapper is unwrapped; a bare clause object is
 * treated as the clause. Everything is tenant-scoped via the segment's `tenantId`.
 */
@Injectable()
export class SegmentEvaluatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: DomainLogger,
  ) {}

  /** Re-materialise a segment's membership. Returns the resolved member count. */
  async evaluate(segmentId: string): Promise<{ count: number }> {
    const segment = await this.prisma.audienceSegment.findUnique({
      where: { id: segmentId },
      select: { id: true, tenantId: true, definition: true },
    });
    if (!segment) throw new NotFoundException(`Segment ${segmentId} not found`);

    const contactIds = Array.from(
      await this.resolveMemberIds(segment.tenantId, segment.definition),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.audienceSegmentMember.deleteMany({ where: { segmentId } });
      if (contactIds.length > 0) {
        await tx.audienceSegmentMember.createMany({
          data: contactIds.map((contactId) => ({ segmentId, contactId })),
          skipDuplicates: true,
        });
      }
    });

    this.logger.debug("audience", "segment evaluated", { segmentId, count: contactIds.length });
    return { count: contactIds.length };
  }

  /** Worker entrypoint for the `segment-eval` queue. */
  async processEvalJob(data: { segmentId: string }): Promise<{ count: number }> {
    return this.evaluate(data.segmentId);
  }

  // ── rule resolution ────────────────────────────────────────────────
  /** Unwraps an `{ include: {...} }` rule, or treats the rule object as the clause. */
  private includeClause(rule: unknown): Clause | undefined {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return undefined;
    const r = rule as Clause;
    if (r.include && typeof r.include === "object" && !Array.isArray(r.include)) {
      return r.include as Clause;
    }
    return r;
  }

  private async resolveMemberIds(tenantId: string, definition: unknown): Promise<Set<string>> {
    const clause = this.includeClause(definition);
    if (!clause) return this.allContactIds(tenantId); // no rule → every contact
    return this.evalClause(tenantId, clause);
  }

  private async evalClause(tenantId: string, clause: Clause): Promise<Set<string>> {
    // Combinators. Empty `all` = no constraints = everyone; empty `any` = nobody.
    if (Array.isArray(clause.all)) {
      const children = clause.all as Clause[];
      if (children.length === 0) return this.allContactIds(tenantId);
      const sets = await Promise.all(children.map((c) => this.evalClause(tenantId, c)));
      return sets.reduce((acc, s) => intersect(acc, s));
    }
    if (Array.isArray(clause.any)) {
      const children = clause.any as Clause[];
      if (children.length === 0) return new Set<string>();
      const sets = await Promise.all(children.map((c) => this.evalClause(tenantId, c)));
      return sets.reduce((acc, s) => union(acc, s), new Set<string>());
    }

    const type = typeof clause.type === "string" ? clause.type : "all";
    switch (type) {
      case "emailDomain":
        return this.byEmailDomain(tenantId, String(clause.domain ?? ""));
      case "hasSource":
        return this.bySourceSystem(tenantId, String(clause.sourceSystem ?? ""));
      case "consentState":
        return this.byConsentState(tenantId, clause.channel, clause.state);
      case "turf":
        return this.byTurf(tenantId, String(clause.turfId ?? ""));
      case "all":
      default:
        return this.allContactIds(tenantId);
    }
  }

  // ── leaf evaluators ─────────────────────────────────────────────────
  private async allContactIds(tenantId: string): Promise<Set<string>> {
    const rows = await this.prisma.contact.findMany({ where: { tenantId }, select: { id: true } });
    return new Set(rows.map((r) => r.id));
  }

  private async byEmailDomain(tenantId: string, domain: string): Promise<Set<string>> {
    const norm = domain.trim().replace(/^@/, "").toLowerCase();
    if (!norm) return new Set();
    const rows = await this.prisma.contact.findMany({
      where: { tenantId, email: { endsWith: `@${norm}`, mode: "insensitive" } },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  private async bySourceSystem(tenantId: string, sourceSystem: string): Promise<Set<string>> {
    const norm = sourceSystem.trim();
    if (!norm) return new Set();
    const rows = await this.prisma.contactSourceRecord.findMany({
      where: { tenantId, sourceSystem: norm },
      select: { contactId: true },
      distinct: ["contactId"],
    });
    return new Set(rows.map((r) => r.contactId));
  }

  private async byConsentState(
    tenantId: string,
    channel: unknown,
    state: unknown,
  ): Promise<Set<string>> {
    if (!isChannel(channel) || !isConsentState(state)) return new Set();
    const rows = await this.prisma.contactConsent.findMany({
      where: { tenantId, channel, state, contactId: { not: null } },
      select: { contactId: true },
    });
    return new Set(rows.map((r) => r.contactId).filter((id): id is string => !!id));
  }

  private async byTurf(tenantId: string, turfId: string): Promise<Set<string>> {
    if (!turfId) return new Set();
    const rows = await this.prisma.contact.findMany({
      where: { tenantId, turfId },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const x of a) if (b.has(x)) out.add(x);
  return out;
}

function union(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>(a);
  for (const x of b) out.add(x);
  return out;
}

function isChannel(v: unknown): v is MessageChannel {
  return typeof v === "string" && (Object.values(MessageChannel) as string[]).includes(v);
}

function isConsentState(v: unknown): v is ConsentState {
  return typeof v === "string" && (Object.values(ConsentState) as string[]).includes(v);
}
