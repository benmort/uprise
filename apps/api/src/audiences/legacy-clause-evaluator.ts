import { ConsentState, MessageChannel } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { InsightsService } from "../insights/insights.service";
import { GEO_REGION_COLUMN } from "./geo-columns";

type Clause = Record<string, unknown>;

/**
 * The LEGACY clause evaluator — the pre-engine-v2 rule language, extracted
 * verbatim from `segment-evaluator.service.ts` so existing stored definitions
 * (no `format` key) keep evaluating exactly as before, forever. New authoring
 * goes through the v2 envelope (`@uprise/segmentation`); this file is frozen
 * behaviour, not a place for new clause types.
 *
 * Clause types:
 *   prog-native  — `{ type: 'emailDomain', domain }`, `{ type: 'hasSource', sourceSystem }`,
 *                  `{ type: 'all' }`
 *   uprise-native — `{ type: 'consentState', channel, state }`, `{ type: 'turf', turfId }`,
 *                  `{ type: 'pollThreshold', … }`
 *   combinators  — `{ all: [clause, …] }` (intersection), `{ any: [clause, …] }` (union)
 *
 * Like prog, an `{ include: {...} }` wrapper is unwrapped; a bare clause object
 * is treated as the clause. Everything is tenant-scoped.
 *
 * A plain class (not `@Injectable`) constructed by `SegmentEvaluatorService` —
 * keeps the evaluator's constructor stable for its existing spec.
 */
export class LegacyClauseEvaluator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly insights: InsightsService,
  ) {}

  /** Unwraps an `{ include: {...} }` rule, or treats the rule object as the clause. */
  private includeClause(rule: unknown): Clause | undefined {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return undefined;
    const r = rule as Clause;
    if (r.include && typeof r.include === "object" && !Array.isArray(r.include)) {
      return r.include as Clause;
    }
    return r;
  }

  async resolveMemberIds(tenantId: string, definition: unknown): Promise<Set<string>> {
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
      case "pollThreshold":
        return this.byPollThreshold(tenantId, clause);
      case "all":
      default:
        return this.allContactIds(tenantId);
    }
  }

  // ── leaf evaluators ─────────────────────────────────────────────────
  async allContactIds(tenantId: string): Promise<Set<string>> {
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

  /**
   * `{ type: 'pollThreshold', pollId, questionCode, response, op, value, geoKind }` —
   * contacts whose address falls in an electorate whose poll estimate meets the
   * threshold (e.g. Treaty NET support ≥ 50%). Resolution is visibility-gated by the
   * shared InsightsService (own + global-tier polls only); the geo join maps a
   * contact's G-NAF address to the region layer via `geo.address_region`.
   */
  private async byPollThreshold(tenantId: string, clause: Clause): Promise<Set<string>> {
    const geoKind = String(clause.geoKind ?? "sed_upper");
    const column = GEO_REGION_COLUMN[geoKind];
    if (!column) return new Set();

    const codes = await this.insights.resolvePollThresholdToGeoCodes(tenantId, {
      pollId: String(clause.pollId ?? ""),
      questionCode: String(clause.questionCode ?? ""),
      response: String(clause.response ?? ""),
      op: String(clause.op ?? ">=") as ">" | ">=" | "<" | "<=" | "=",
      value: Number(clause.value ?? 0),
      geoKind,
    });
    if (codes.length === 0) return new Set();

    // Cross-schema join (public.Contact → geo.address_region). The codes go in as a
    // JSON array (the repo's raw-list convention, see geo.service unionSources); the
    // column name is the validated GEO_REGION_COLUMN value, not raw clause input.
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT c.id
         FROM public."Contact" c
         JOIN geo.address_region ar ON ar.gnaf_pid = c."gnafPid"
        WHERE c."tenantId" = $1
          AND ar.${column} IN (SELECT jsonb_array_elements_text($2::jsonb))`,
      tenantId,
      JSON.stringify(codes),
    )) as Array<{ id: string }>;
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
