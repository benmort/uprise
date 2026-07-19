import { Injectable } from "@nestjs/common";
import {
  BlastRecipientStatus,
  ConsentState,
  JourneyEnrolmentState,
  MessageChannel,
  RsvpStatus,
  SupportLevel,
} from "@uprise/db";
import type {
  BlastReceivedCondition,
  BlastRepliedCondition,
  Condition,
  DateCondition,
  EffectiveLeaf,
  EventRsvpedCondition,
  GeoAreaCondition,
  JourneyEnrolledCondition,
  PollThresholdCondition,
  SegmentCustomClause,
} from "@uprise/segmentation";
import { difference, intersect } from "@uprise/segmentation";
import { PrismaService } from "../prisma/prisma.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { InsightsService } from "../insights/insights.service";
import { CustomQueryService } from "./custom-query.service";
import { GEO_REGION_COLUMN } from "./geo-columns";

/** Validated `geo.gnaf_address` columns for the contact location conditions (raw-SQL allowlist). */
const GNAF_COLUMN: Record<string, string> = {
  "contact.state": "state",
  "contact.postcode": "postcode",
  "contact.locality": "locality",
};

/** Blast statuses that count as "received" (the message went out to them). */
const RECEIVED_STATUSES: BlastRecipientStatus[] = [
  BlastRecipientStatus.SENT,
  BlastRecipientStatus.DELIVERED,
  BlastRecipientStatus.READ,
  BlastRecipientStatus.RESPONDED,
];

interface DateRange {
  gte?: Date;
  lt?: Date;
  lte?: Date;
}

/** A surfaced custom-clause failure (shown in the builder's preview rail). */
export interface ClauseError {
  clauseId: string;
  reasons: string[];
}

export interface LeafResolutionContext {
  /** The envelope's AI custom clauses, for `custom.clause` leaves. */
  customClauses?: SegmentCustomClause[];
}

export interface LeafResolution {
  resolved: Map<EffectiveLeaf, ReadonlySet<string>>;
  clauseErrors: ClauseError[];
}

const enumSubset = <T extends string>(values: string[] | undefined, all: readonly T[]): T[] =>
  (values ?? []).filter((v): v is T => (all as readonly string[]).includes(v));

/**
 * The I/O host for the segmentation fold — resolves every effective-tree leaf
 * to the set of contact ids it matches, tenant-scoped, one family at a time.
 *
 * **Fail-closed contract (ported from slingshot's LeafResolver doc):** any
 * unroutable, unknown, or errored leaf resolves to the EMPTY SET with a warn —
 * never the universe. ∅ can only restrict; a universe fallback would silently
 * widen the audience and could pass opted-out contacts through a compliance
 * leaf. A deliberate no-op (a disabled mechanic) returns `universe` explicitly.
 *
 * Negative operators (`notIn` / `isNot` / a bool mismatch) are complements over
 * the tenant universe — the same semantics as the fold's `none` group.
 *
 * Leaves resolve SEQUENTIALLY (not Promise.all) so a 20-leaf tree cannot fan
 * 20 concurrent full-table queries at Postgres; per-leaf sizes are logged for
 * scale observability.
 */
@Injectable()
export class SegmentLeafResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: DomainLogger,
    private readonly insights: InsightsService,
    private readonly customQuery: CustomQueryService,
  ) {}

  /** The tenant's full contact-id universe (the base for complements + `none`). */
  async universe(tenantId: string): Promise<Set<string>> {
    const rows = await this.prisma.contact.findMany({
      where: { tenantId },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /** Resolve every leaf against live data. Sequential; fail-closed per leaf. */
  async resolveLeaves(
    tenantId: string,
    leaves: EffectiveLeaf[],
    universe: ReadonlySet<string>,
    ctx: LeafResolutionContext = {},
  ): Promise<LeafResolution> {
    const resolved = new Map<EffectiveLeaf, ReadonlySet<string>>();
    const clauseErrors: ClauseError[] = [];
    for (const leaf of leaves) {
      try {
        resolved.set(leaf, await this.resolveLeaf(tenantId, leaf, universe, ctx, clauseErrors));
      } catch (error) {
        // Fail closed: an errored leaf matches nobody, never everybody.
        this.logger.warn("audience", "segment leaf resolution failed (fail-closed ∅)", {
          tenantId,
          leaf: leaf.kind === "condition" ? leaf.condition.type : leaf.mechanic,
          message: error instanceof Error ? error.message : String(error),
        });
        resolved.set(leaf, new Set());
      }
    }
    this.logger.debug("audience", "segment leaves resolved", {
      tenantId,
      universe: universe.size,
      leaves: leaves.map((l) => ({
        type: l.kind === "condition" ? l.condition.type : `mechanic:${l.mechanic}`,
        size: resolved.get(l)?.size ?? 0,
      })),
    });
    return { resolved, clauseErrors };
  }

  private async resolveLeaf(
    tenantId: string,
    leaf: EffectiveLeaf,
    universe: ReadonlySet<string>,
    ctx: LeafResolutionContext,
    clauseErrors: ClauseError[],
  ): Promise<ReadonlySet<string>> {
    if (leaf.kind === "mechanic") {
      if (leaf.mechanic === "fatigue") {
        return this.passesFatigue(tenantId, leaf.windowHours, leaf.maxSends, universe);
      }
      this.logger.warn("audience", "unknown mechanic leaf (fail-closed ∅)", { tenantId });
      return new Set();
    }

    const condition = leaf.condition;
    switch (condition.type) {
      // ── contact — G-NAF location ──────────────────────────────────────
      case "contact.state":
      case "contact.locality": {
        const matched = await this.byGnafColumn(tenantId, condition.type, condition.values);
        return condition.op === "notIn" ? difference(universe, matched) : matched;
      }
      case "contact.postcode": {
        const values = condition.op === "eq" ? [condition.value] : condition.values;
        const matched = await this.byGnafColumn(tenantId, condition.type, values);
        return condition.op === "notIn" ? difference(universe, matched) : matched;
      }

      // ── contact — spine fields ────────────────────────────────────────
      case "contact.hasEmail":
      case "contact.hasPhone": {
        const field = condition.type === "contact.hasEmail" ? "email" : "phoneE164";
        const rows = await this.prisma.contact.findMany({
          where: { tenantId, [field]: { not: null } },
          select: { id: true },
        });
        const has = new Set(rows.map((r) => r.id));
        const positive = condition.value ? has : difference(universe, has);
        return condition.op === "isNot" ? difference(universe, positive) : positive;
      }
      case "contact.consented": {
        // APP 5 consent stamp rolled up onto the contact spine (latest disposition wins).
        const rows = await this.prisma.contact.findMany({
          where: { tenantId, consentAt: { not: null } },
          select: { id: true },
        });
        const has = new Set(rows.map((r) => r.id));
        const positive = condition.value ? has : difference(universe, has);
        return condition.op === "isNot" ? difference(universe, positive) : positive;
      }
      case "contact.emailDomain": {
        const norm = condition.value.trim().replace(/^@/, "").toLowerCase();
        if (!norm) return new Set();
        const rows = await this.prisma.contact.findMany({
          where: {
            tenantId,
            email:
              condition.op === "eq"
                ? { endsWith: `@${norm}`, mode: "insensitive" }
                : { contains: norm, mode: "insensitive" },
          },
          select: { id: true },
        });
        return new Set(rows.map((r) => r.id));
      }
      case "contact.createdAt": {
        const rows = await this.prisma.contact.findMany({
          where: { tenantId, createdAt: this.dateRange(condition) },
          select: { id: true },
        });
        return new Set(rows.map((r) => r.id));
      }
      case "contact.turf": {
        const rows = await this.prisma.contact.findMany({
          where: { tenantId, turfId: { in: condition.values } },
          select: { id: true },
        });
        const matched = new Set(rows.map((r) => r.id));
        return condition.op === "notIn" ? difference(universe, matched) : matched;
      }
      case "contact.supportLevel": {
        const levels = enumSubset(condition.values, Object.values(SupportLevel));
        if (levels.length === 0) return new Set();
        const rows = await this.prisma.disposition.findMany({
          where: { tenantId, supportLevel: { in: levels } },
          select: { contactId: true },
          distinct: ["contactId"],
        });
        const matched = new Set(rows.map((r) => r.contactId));
        return condition.op === "notIn" ? difference(universe, matched) : matched;
      }

      // ── tag / consent / source ────────────────────────────────────────
      case "tag.tagged": {
        const rows = await this.prisma.contactTagAssignment.findMany({
          where: { tenantId, tagId: { in: condition.values } },
          select: { contactId: true },
          distinct: ["contactId"],
        });
        const matched = new Set(rows.map((r) => r.contactId));
        return condition.op === "notIn" ? difference(universe, matched) : matched;
      }
      case "consent.sms":
      case "consent.whatsapp": {
        const channel =
          condition.type === "consent.sms" ? MessageChannel.SMS : MessageChannel.WHATSAPP;
        const states = enumSubset(condition.values, Object.values(ConsentState));
        if (states.length === 0) return new Set();
        const matched = await this.byConsent(tenantId, channel, states);
        return condition.op === "notIn" ? difference(universe, matched) : matched;
      }
      case "source.system": {
        const rows = await this.prisma.contactSourceRecord.findMany({
          where: { tenantId, sourceSystem: { in: condition.values } },
          select: { contactId: true },
          distinct: ["contactId"],
        });
        const matched = new Set(rows.map((r) => r.contactId));
        return condition.op === "notIn" ? difference(universe, matched) : matched;
      }

      // ── activity ──────────────────────────────────────────────────────
      case "activity.lastActiveWithin":
        return this.byAnyActivity(tenantId, this.dateRange(condition));
      case "canvass.doorKnockedAt": {
        const rows = await this.prisma.doorKnock.findMany({
          where: { tenantId, createdAt: this.dateRange(condition) },
          select: { contactId: true },
          distinct: ["contactId"],
        });
        return new Set(rows.map((r) => r.contactId));
      }
      case "canvass.dispositionCode": {
        const rows = await this.prisma.disposition.findMany({
          where: { tenantId, code: { in: condition.values } },
          select: { contactId: true },
          distinct: ["contactId"],
        });
        const matched = new Set(rows.map((r) => r.contactId));
        return condition.op === "notIn" ? difference(universe, matched) : matched;
      }
      case "survey.responded": {
        const rows = await this.prisma.questionResponse.findMany({
          where: { tenantId, question: { surveyId: condition.surveyId } },
          select: { contactId: true },
          distinct: ["contactId"],
        });
        const matched = new Set(rows.map((r) => r.contactId));
        return condition.op === "isNot" ? difference(universe, matched) : matched;
      }
      case "survey.answered": {
        const rows = await this.prisma.questionResponse.findMany({
          where: {
            tenantId,
            questionId: condition.questionId,
            OR: [{ option: { value: { in: condition.values } } }, { valueText: { in: condition.values } }],
          },
          select: { contactId: true },
          distinct: ["contactId"],
        });
        const matched = new Set(rows.map((r) => r.contactId));
        return condition.op === "notIn" ? difference(universe, matched) : matched;
      }
      case "event.rsvped":
        return this.byEventRsvp(tenantId, condition, universe);
      case "blast.received":
        return this.byBlastReceived(tenantId, condition, universe);
      case "blast.replied":
        return this.byBlastReplied(tenantId, condition, universe);
      case "journey.enrolled":
        return this.byJourneyEnrolled(tenantId, condition, universe);
      case "email.openedAt":
      case "email.clickedAt": {
        const field = condition.type === "email.openedAt" ? "openedAt" : "clickedAt";
        const rows = await this.prisma.email.findMany({
          where: { tenantId, contactId: { not: null }, [field]: this.dateRange(condition) },
          select: { contactId: true },
          distinct: ["contactId"],
        });
        return new Set(rows.map((r) => r.contactId).filter((id): id is string => !!id));
      }

      // ── geo / insights ────────────────────────────────────────────────
      case "geo.area":
        return this.byGeoArea(tenantId, condition, universe);
      case "insights.pollThreshold":
        return this.byPollThreshold(tenantId, condition);

      // ── custom (the AI SQL lane) ──────────────────────────────────────
      case "custom.clause":
        return this.byCustomClause(tenantId, condition.clauseRef, ctx, clauseErrors);

      // ── L3 compliance floor ───────────────────────────────────────────
      case "compliance.channelConsent": {
        if (condition.channel === "WHATSAPP") {
          // WhatsApp is opt-in only.
          return this.byConsent(tenantId, MessageChannel.WHATSAPP, [ConsentState.OPTED_IN]);
        }
        // SMS: everyone except the explicitly opted-out.
        const optedOut = await this.byConsent(tenantId, MessageChannel.SMS, [
          ConsentState.OPTED_OUT,
        ]);
        return difference(universe, optedOut);
      }
      case "compliance.notSuppressed":
        return difference(universe, await this.suppressedContacts(tenantId));
      case "compliance.reachable": {
        const rows = await this.prisma.contact.findMany({
          where: { tenantId, phoneE164: { not: null } },
          select: { id: true },
        });
        return intersect(new Set(rows.map((r) => r.id)), universe);
      }

      // ── L2 marker (should never reach evaluation — the predicate is inlined) ──
      case "policy.isActive":
      default: {
        const type = (condition as Condition).type;
        this.logger.warn("audience", "unroutable condition leaf (fail-closed ∅)", {
          tenantId,
          type,
        });
        return new Set();
      }
    }
  }

  // ── shared helpers ────────────────────────────────────────────────────

  /** Date range from a DateCondition's op (within days / before / after / between). */
  private dateRange(condition: DateCondition<string>): DateRange {
    switch (condition.op) {
      case "within":
        return { gte: new Date(Date.now() - condition.days * 86_400_000) };
      case "before":
        return { lt: new Date(condition.date) };
      case "after":
        return { gte: new Date(condition.date) };
      case "between":
        return { gte: new Date(condition.from), lte: new Date(condition.to) };
    }
  }

  /** Contacts whose G-NAF address column matches one of the values (raw allowlisted join). */
  private async byGnafColumn(
    tenantId: string,
    type: string,
    values: string[],
  ): Promise<Set<string>> {
    const column = GNAF_COLUMN[type];
    if (!column || values.length === 0) return new Set();
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT c.id
         FROM public."Contact" c
         JOIN geo.gnaf_address g ON g.gnaf_pid = c."gnafPid"
        WHERE c."tenantId" = $1
          AND upper(g.${column}) IN (SELECT upper(jsonb_array_elements_text($2::jsonb)))`,
      tenantId,
      JSON.stringify(values),
    )) as Array<{ id: string }>;
    return new Set(rows.map((r) => r.id));
  }

  private async byConsent(
    tenantId: string,
    channel: MessageChannel,
    states: ConsentState[],
  ): Promise<Set<string>> {
    const rows = await this.prisma.contactConsent.findMany({
      where: { tenantId, channel, state: { in: states }, contactId: { not: null } },
      select: { contactId: true },
    });
    return new Set(rows.map((r) => r.contactId).filter((id): id is string => !!id));
  }

  /** Any engagement in range: door knock, survey answer, RSVP or inbound reply. */
  private async byAnyActivity(tenantId: string, range: DateRange): Promise<Set<string>> {
    const [knocks, responses, rsvps, inbound] = [
      await this.prisma.doorKnock.findMany({
        where: { tenantId, createdAt: range },
        select: { contactId: true },
        distinct: ["contactId"],
      }),
      await this.prisma.questionResponse.findMany({
        where: { tenantId, createdAt: range },
        select: { contactId: true },
        distinct: ["contactId"],
      }),
      await this.prisma.eventRsvp.findMany({
        where: { tenantId, contactId: { not: null }, createdAt: range },
        select: { contactId: true },
        distinct: ["contactId"],
      }),
      await this.prisma.inboundMessage.findMany({
        where: { tenantId, contactId: { not: null }, receivedAt: range },
        select: { contactId: true },
        distinct: ["contactId"],
      }),
    ];
    const out = new Set<string>();
    for (const r of knocks) out.add(r.contactId);
    for (const r of responses) out.add(r.contactId);
    for (const r of rsvps) if (r.contactId) out.add(r.contactId);
    for (const r of inbound) if (r.contactId) out.add(r.contactId);
    return out;
  }

  private async byEventRsvp(
    tenantId: string,
    condition: EventRsvpedCondition,
    universe: ReadonlySet<string>,
  ): Promise<ReadonlySet<string>> {
    const statuses = enumSubset(condition.statuses, Object.values(RsvpStatus));
    const rows = await this.prisma.eventRsvp.findMany({
      where: {
        tenantId,
        ...(condition.eventId ? { eventId: condition.eventId } : {}),
        status: { in: statuses.length ? statuses : [RsvpStatus.GOING, RsvpStatus.ATTENDED] },
        contactId: { not: null },
      },
      select: { contactId: true },
      distinct: ["contactId"],
    });
    const matched = new Set(rows.map((r) => r.contactId).filter((id): id is string => !!id));
    return condition.op === "isNot" ? difference(universe, matched) : matched;
  }

  private async byBlastReceived(
    tenantId: string,
    condition: BlastReceivedCondition,
    universe: ReadonlySet<string>,
  ): Promise<ReadonlySet<string>> {
    // BlastRecipient has no tenantId — scope through the blast relation.
    const rows = await this.prisma.blastRecipient.findMany({
      where: {
        blast: { tenantId },
        ...(condition.blastId ? { blastId: condition.blastId } : {}),
        status: { in: RECEIVED_STATUSES },
        contactId: { not: null },
        ...(condition.withinDays
          ? { sentAt: { gte: new Date(Date.now() - condition.withinDays * 86_400_000) } }
          : {}),
      },
      select: { contactId: true },
      distinct: ["contactId"],
    });
    const matched = new Set(rows.map((r) => r.contactId).filter((id): id is string => !!id));
    return condition.op === "isNot" ? difference(universe, matched) : matched;
  }

  private async byBlastReplied(
    tenantId: string,
    condition: BlastRepliedCondition,
    universe: ReadonlySet<string>,
  ): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.inboundMessage.findMany({
      where: {
        tenantId,
        ...(condition.blastId ? { blastId: condition.blastId } : {}),
        contactId: { not: null },
        ...(condition.withinDays
          ? { receivedAt: { gte: new Date(Date.now() - condition.withinDays * 86_400_000) } }
          : {}),
      },
      select: { contactId: true },
      distinct: ["contactId"],
    });
    const matched = new Set(rows.map((r) => r.contactId).filter((id): id is string => !!id));
    return condition.op === "isNot" ? difference(universe, matched) : matched;
  }

  private async byJourneyEnrolled(
    tenantId: string,
    condition: JourneyEnrolledCondition,
    universe: ReadonlySet<string>,
  ): Promise<ReadonlySet<string>> {
    const states = enumSubset(condition.states, Object.values(JourneyEnrolmentState));
    const rows = await this.prisma.journeyEnrolment.findMany({
      where: {
        tenantId,
        ...(condition.journeyId ? { journeyId: condition.journeyId } : {}),
        state: { in: states.length ? states : [JourneyEnrolmentState.ACTIVE] },
      },
      select: { contactId: true },
      distinct: ["contactId"],
    });
    const matched = new Set(rows.map((r) => r.contactId));
    return condition.op === "isNot" ? difference(universe, matched) : matched;
  }

  /** Region membership over `geo.address_region` (validated column allowlist). */
  private async byGeoArea(
    tenantId: string,
    condition: GeoAreaCondition,
    universe: ReadonlySet<string>,
  ): Promise<ReadonlySet<string>> {
    const column = GEO_REGION_COLUMN[condition.areaType];
    if (!column || condition.values.length === 0) return new Set();
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT c.id
         FROM public."Contact" c
         JOIN geo.address_region ar ON ar.gnaf_pid = c."gnafPid"
        WHERE c."tenantId" = $1
          AND ar.${column} IN (SELECT jsonb_array_elements_text($2::jsonb))`,
      tenantId,
      JSON.stringify(condition.values),
    )) as Array<{ id: string }>;
    const matched = new Set(rows.map((r) => r.id));
    return condition.op === "notIn" ? difference(universe, matched) : matched;
  }

  /** The poll-threshold clause — the legacy evaluator's logic on the v2 condition shape. */
  private async byPollThreshold(
    tenantId: string,
    condition: PollThresholdCondition,
  ): Promise<Set<string>> {
    const column = GEO_REGION_COLUMN[condition.geoKind];
    if (!column) return new Set();
    const codes = await this.insights.resolvePollThresholdToGeoCodes(tenantId, {
      pollId: condition.pollId,
      questionCode: condition.questionCode,
      response: condition.response,
      op: condition.op,
      value: condition.value,
      geoKind: condition.geoKind,
    });
    if (codes.length === 0) return new Set();
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

  /** Resolve an envelope custom clause via the contained SQL lane (fail-closed ∅). */
  private async byCustomClause(
    tenantId: string,
    clauseRef: string,
    ctx: LeafResolutionContext,
    clauseErrors: ClauseError[],
  ): Promise<ReadonlySet<string>> {
    const clause = ctx.customClauses?.find((c) => c.id === clauseRef);
    if (!clause) {
      clauseErrors.push({ clauseId: clauseRef, reasons: ["Clause not found on the definition."] });
      return new Set();
    }
    // Re-validated + contained on EVERY evaluation — stored SQL is never trusted.
    const result = await this.customQuery.resolveContacts(tenantId, clause.predicate);
    if (!result.ok) {
      clauseErrors.push({ clauseId: clauseRef, reasons: result.reasons });
      return new Set();
    }
    return new Set(result.contactIds);
  }

  /** Contacts on the tenant suppression list (matched by phone or email). */
  private async suppressedContacts(tenantId: string): Promise<Set<string>> {
    const rows = await this.prisma.suppression.findMany({
      where: { tenantId },
      select: { phoneE164: true, email: true },
    });
    const phones = rows.map((r) => r.phoneE164).filter((v): v is string => !!v);
    const emails = rows.map((r) => r.email).filter((v): v is string => !!v);
    if (phones.length === 0 && emails.length === 0) return new Set();
    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        OR: [
          ...(phones.length ? [{ phoneE164: { in: phones } }] : []),
          ...(emails.length ? [{ email: { in: emails, mode: "insensitive" as const } }] : []),
        ],
      },
      select: { id: true },
    });
    return new Set(contacts.map((c) => c.id));
  }

  /** The fatigue mechanic: universe ∖ contacts at/over the send cap in the window. */
  private async passesFatigue(
    tenantId: string,
    windowHours: number,
    maxSends: number,
    universe: ReadonlySet<string>,
  ): Promise<Set<string>> {
    const windowStart = new Date(Date.now() - windowHours * 3_600_000);
    const rows = await this.prisma.blastRecipient.groupBy({
      by: ["contactId"],
      where: { blast: { tenantId }, sentAt: { gte: windowStart }, contactId: { not: null } },
      _count: { contactId: true },
      having: { contactId: { _count: { gte: maxSends } } },
    });
    const overCap = new Set(
      rows.map((r) => r.contactId).filter((id): id is string => !!id),
    );
    return difference(universe, overCap);
  }
}
