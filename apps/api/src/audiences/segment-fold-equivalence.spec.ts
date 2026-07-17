/**
 * The fold-equivalence oracle (the slingshot SEG-0024 discipline, ported) —
 * ONE declarative fixture projected into BOTH worlds:
 *
 *  (a) a stubbed Prisma the REAL `SegmentLeafResolverService` queries, folded
 *      by the REAL engine path (compose → resolve → foldEffectiveTree);
 *  (b) a naive per-contact ORACLE interpreter written here, evaluating the
 *      same tree contact-by-contact from the fixture directly.
 *
 * For a battery of trees covering every wired condition family, the two worlds
 * must produce IDENTICAL member sets and BIT-IDENTICAL hash order. A resolver
 * that drifts from the vocabulary's meaning — or a fold that mis-combines —
 * fails here, not in production.
 */
import {
  composeEffectiveTree,
  collectEffectiveLeaves,
  foldEffectiveTree,
  orderByHash,
  DEFAULT_SEGMENT_POLICY,
  type Condition,
  type FilterNode,
  type SegmentPolicy,
} from "@uprise/segmentation";
import { SegmentLeafResolverService } from "./segment-leaf-resolver.service";

// ── the fixture ─────────────────────────────────────────────────────────────
const NOW = Date.now();
const days = (n: number) => new Date(NOW - n * 86_400_000);
const hours = (n: number) => new Date(NOW - n * 3_600_000);

interface FixtureContact {
  id: string;
  phoneE164: string | null;
  email: string | null;
  turfId: string | null;
  createdAt: Date;
  gnaf?: { state: string; postcode: string; locality: string; ced?: string };
  tags?: string[];
  consents?: Array<{ channel: "SMS" | "WHATSAPP"; state: string }>;
  sources?: string[];
  dispositions?: Array<{ supportLevel: string | null; code: string }>;
  doorKnocks?: Date[];
  responses?: Array<{ questionId: string; surveyId: string; optionValue?: string; valueText?: string; at: Date }>;
  rsvps?: Array<{ eventId: string; status: string; at: Date }>;
  blastsReceived?: Array<{ blastId: string; sentAt: Date }>;
  replies?: Array<{ blastId: string | null; at: Date }>;
  journeys?: Array<{ journeyId: string; state: string }>;
  emails?: Array<{ openedAt?: Date; clickedAt?: Date }>;
  suppressed?: boolean;
}

const FIXTURE: FixtureContact[] = [
  {
    id: "c1",
    phoneE164: "+61400000001",
    email: "alex@getup.org.au",
    turfId: "t1",
    createdAt: days(10),
    gnaf: { state: "NSW", postcode: "2000", locality: "Sydney", ced: "CED_SYD" },
    tags: ["tag_climate"],
    consents: [{ channel: "SMS", state: "OPTED_IN" }],
    sources: ["csv"],
    dispositions: [{ supportLevel: "STRONG_SUPPORT", code: "MEANINGFUL" }],
    doorKnocks: [days(5)],
    responses: [{ questionId: "q1", surveyId: "s1", optionValue: "yes", at: days(10) }],
    rsvps: [{ eventId: "e1", status: "GOING", at: days(3) }],
    blastsReceived: [{ blastId: "b1", sentAt: days(2) }],
    replies: [{ blastId: "b1", at: days(1) }],
    journeys: [{ journeyId: "j1", state: "ACTIVE" }],
    emails: [{ openedAt: days(3) }],
  },
  {
    id: "c2",
    phoneE164: null,
    email: "b@corp.com",
    turfId: null,
    createdAt: days(400),
    gnaf: { state: "VIC", postcode: "3000", locality: "Melbourne" },
    tags: ["tag_union"],
    consents: [{ channel: "SMS", state: "OPTED_OUT" }],
    dispositions: [{ supportLevel: "LEAN_OPPOSE", code: "NOT_HOME" }],
    doorKnocks: [days(40)],
    rsvps: [{ eventId: "e1", status: "CANCELLED", at: days(20) }],
    suppressed: true,
  },
  {
    id: "c3",
    phoneE164: "+61400000003",
    email: null,
    turfId: "t2",
    createdAt: days(200),
    gnaf: { state: "QLD", postcode: "4000", locality: "Brisbane", ced: "CED_BNE" },
    consents: [{ channel: "WHATSAPP", state: "OPTED_IN" }],
    sources: ["action_network"],
    blastsReceived: [{ blastId: "b1", sentAt: days(20) }],
    journeys: [{ journeyId: "j1", state: "COMPLETED" }],
  },
  {
    id: "c4",
    phoneE164: "+61400000004",
    email: "d@example.org",
    turfId: null,
    createdAt: days(900),
    gnaf: { state: "NSW", postcode: "2010", locality: "Surry Hills" },
  },
  {
    id: "c5",
    phoneE164: "+61400000005",
    email: null,
    turfId: "t1",
    createdAt: days(50),
    tags: ["tag_climate", "tag_union"],
    doorKnocks: [days(100)],
    responses: [{ questionId: "q1", surveyId: "s1", valueText: "maybe", at: days(100) }],
  },
  {
    id: "c6",
    phoneE164: "+61400000006",
    email: null,
    turfId: null,
    createdAt: days(30),
    gnaf: { state: "NSW", postcode: "2000", locality: "Sydney" },
    suppressed: true,
  },
  {
    id: "c7",
    phoneE164: "+61400000007",
    email: "g@getup.org.au",
    turfId: "t2",
    createdAt: days(5),
    consents: [
      { channel: "SMS", state: "OPTED_IN" },
      { channel: "WHATSAPP", state: "OPTED_IN" },
    ],
    rsvps: [{ eventId: "e2", status: "ATTENDED", at: days(8) }],
    emails: [{ clickedAt: days(5) }],
  },
  {
    id: "c8",
    phoneE164: "+61400000008",
    email: null,
    turfId: null,
    createdAt: days(60),
    // Fatigued: 3 sends inside the last 72h.
    blastsReceived: [
      { blastId: "b2", sentAt: hours(10) },
      { blastId: "b3", sentAt: hours(30) },
      { blastId: "b4", sentAt: hours(60) },
    ],
  },
];

// ── world (a): the stubbed Prisma the REAL resolvers query ──────────────────
const inRange = (at: Date, range: { gte?: Date; lt?: Date; lte?: Date }): boolean =>
  (!range.gte || at >= range.gte) && (!range.lt || at < range.lt) && (!range.lte || at <= range.lte);

function fakePrisma() {
  const ids = (rows: Array<{ id: string }>) => rows;
  return {
    contact: {
      findMany: jest.fn(async ({ where }: any) => {
        return ids(
          FIXTURE.filter((c) => {
            if (where.id?.in && !where.id.in.includes(c.id)) return false;
            if (where.turfId?.in && !(c.turfId && where.turfId.in.includes(c.turfId))) return false;
            if (where.email?.not === null && c.email === null) return false;
            if (where.phoneE164?.not === null && c.phoneE164 === null) return false;
            if (where.email?.endsWith) {
              if (!c.email?.toLowerCase().endsWith(where.email.endsWith.toLowerCase())) return false;
            }
            if (where.email?.contains) {
              if (!c.email?.toLowerCase().includes(where.email.contains.toLowerCase())) return false;
            }
            if (where.email?.in) {
              if (!c.email || !where.email.in.some((e: string) => e.toLowerCase() === c.email!.toLowerCase()))
                return false;
            }
            if (where.OR) {
              const ok = where.OR.some((clause: any) => {
                if (clause.phoneE164?.in) return c.phoneE164 && clause.phoneE164.in.includes(c.phoneE164);
                if (clause.email?.in)
                  return c.email && clause.email.in.some((e: string) => e.toLowerCase() === c.email!.toLowerCase());
                return false;
              });
              if (!ok) return false;
            }
            if (where.createdAt && !inRange(c.createdAt, where.createdAt)) return false;
            return true;
          }).map((c) => ({ id: c.id })),
        );
      }),
    },
    disposition: {
      findMany: jest.fn(async ({ where }: any) =>
        FIXTURE.filter((c) =>
          (c.dispositions ?? []).some(
            (d) =>
              (!where.supportLevel?.in || (d.supportLevel && where.supportLevel.in.includes(d.supportLevel))) &&
              (!where.code?.in || where.code.in.includes(d.code)),
          ),
        ).map((c) => ({ contactId: c.id })),
      ),
    },
    contactTagAssignment: {
      findMany: jest.fn(async ({ where }: any) =>
        FIXTURE.filter((c) => (c.tags ?? []).some((t) => where.tagId.in.includes(t))).map((c) => ({
          contactId: c.id,
        })),
      ),
    },
    contactConsent: {
      findMany: jest.fn(async ({ where }: any) =>
        FIXTURE.filter((c) =>
          (c.consents ?? []).some(
            (k) => k.channel === where.channel && where.state.in.includes(k.state),
          ),
        ).map((c) => ({ contactId: c.id })),
      ),
    },
    contactSourceRecord: {
      findMany: jest.fn(async ({ where }: any) =>
        FIXTURE.filter((c) => (c.sources ?? []).some((s) => where.sourceSystem.in.includes(s))).map(
          (c) => ({ contactId: c.id }),
        ),
      ),
    },
    doorKnock: {
      findMany: jest.fn(async ({ where }: any) =>
        FIXTURE.filter((c) => (c.doorKnocks ?? []).some((at) => inRange(at, where.createdAt))).map(
          (c) => ({ contactId: c.id }),
        ),
      ),
    },
    questionResponse: {
      findMany: jest.fn(async ({ where }: any) =>
        FIXTURE.filter((c) =>
          (c.responses ?? []).some((r) => {
            if (where.createdAt && !inRange(r.at, where.createdAt)) return false;
            if (where.question?.surveyId && r.surveyId !== where.question.surveyId) return false;
            if (where.questionId && r.questionId !== where.questionId) return false;
            if (where.OR) {
              return where.OR.some((clause: any) => {
                if (clause.option?.value?.in)
                  return r.optionValue && clause.option.value.in.includes(r.optionValue);
                if (clause.valueText?.in) return r.valueText && clause.valueText.in.includes(r.valueText);
                return false;
              });
            }
            return true;
          }),
        ).map((c) => ({ contactId: c.id })),
      ),
    },
    eventRsvp: {
      findMany: jest.fn(async ({ where }: any) =>
        FIXTURE.filter((c) =>
          (c.rsvps ?? []).some((r) => {
            if (where.eventId && r.eventId !== where.eventId) return false;
            if (where.status?.in && !where.status.in.includes(r.status)) return false;
            if (where.createdAt && !inRange(r.at, where.createdAt)) return false;
            return true;
          }),
        ).map((c) => ({ contactId: c.id })),
      ),
    },
    inboundMessage: {
      findMany: jest.fn(async ({ where }: any) =>
        FIXTURE.filter((c) =>
          (c.replies ?? []).some((r) => {
            if (where.blastId && r.blastId !== where.blastId) return false;
            if (where.receivedAt && !inRange(r.at, where.receivedAt)) return false;
            return true;
          }),
        ).map((c) => ({ contactId: c.id })),
      ),
    },
    journeyEnrolment: {
      findMany: jest.fn(async ({ where }: any) =>
        FIXTURE.filter((c) =>
          (c.journeys ?? []).some((j) => {
            if (where.journeyId && j.journeyId !== where.journeyId) return false;
            if (where.state?.in && !where.state.in.includes(j.state)) return false;
            return true;
          }),
        ).map((c) => ({ contactId: c.id })),
      ),
    },
    email: {
      findMany: jest.fn(async ({ where }: any) =>
        FIXTURE.filter((c) =>
          (c.emails ?? []).some((e) => {
            if (where.openedAt) return e.openedAt && inRange(e.openedAt, where.openedAt);
            if (where.clickedAt) return e.clickedAt && inRange(e.clickedAt, where.clickedAt);
            return false;
          }),
        ).map((c) => ({ contactId: c.id })),
      ),
    },
    blastRecipient: {
      findMany: jest.fn(async ({ where }: any) =>
        FIXTURE.filter((c) =>
          (c.blastsReceived ?? []).some((b) => {
            if (where.blastId && b.blastId !== where.blastId) return false;
            if (where.sentAt && !inRange(b.sentAt, where.sentAt)) return false;
            return true;
          }),
        ).map((c) => ({ contactId: c.id })),
      ),
      groupBy: jest.fn(async ({ where, having }: any) => {
        const counts = new Map<string, number>();
        for (const c of FIXTURE) {
          for (const b of c.blastsReceived ?? []) {
            if (where.sentAt && !inRange(b.sentAt, where.sentAt)) continue;
            counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
          }
        }
        const min = having.contactId._count.gte;
        return [...counts.entries()]
          .filter(([, n]) => n >= min)
          .map(([contactId]) => ({ contactId, _count: { contactId: counts.get(contactId)! } }));
      }),
    },
    suppression: {
      findMany: jest.fn(async () =>
        FIXTURE.filter((c) => c.suppressed).map((c) => ({
          phoneE164: c.phoneE164,
          email: c.email,
        })),
      ),
    },
    $queryRawUnsafe: jest.fn(async (sql: string, _tenantId: string, valuesJson: string) => {
      const values: string[] = JSON.parse(valuesJson);
      if (sql.includes("geo.gnaf_address")) {
        const column = /g\.(\w+)\)? IN/.exec(sql)?.[1] as "state" | "postcode" | "locality";
        return FIXTURE.filter(
          (c) => c.gnaf && values.some((v) => v.toUpperCase() === c.gnaf![column].toUpperCase()),
        ).map((c) => ({ id: c.id }));
      }
      if (sql.includes("geo.address_region")) {
        // Only ced is populated in the fixture.
        return FIXTURE.filter((c) => c.gnaf?.ced && values.includes(c.gnaf.ced)).map((c) => ({
          id: c.id,
        }));
      }
      throw new Error(`unexpected raw SQL in fixture: ${sql}`);
    }),
  };
}

// ── world (b): the naive per-contact oracle ─────────────────────────────────
function oracleMatches(c: FixtureContact, condition: Condition): boolean {
  const dateHit = (ats: Date[], cond: { op: string } & Record<string, unknown>): boolean => {
    const range =
      cond.op === "within"
        ? { gte: new Date(NOW - (cond.days as number) * 86_400_000) }
        : cond.op === "before"
          ? { lt: new Date(cond.date as string) }
          : cond.op === "after"
            ? { gte: new Date(cond.date as string) }
            : { gte: new Date(cond.from as string), lte: new Date(cond.to as string) };
    return ats.some((at) => inRange(at, range));
  };

  switch (condition.type) {
    case "contact.state":
      return applyNot(condition.op, !!c.gnaf && condition.values.includes(c.gnaf.state));
    case "contact.postcode": {
      const values = condition.op === "eq" ? [condition.value] : condition.values;
      const positive = !!c.gnaf && values.includes(c.gnaf.postcode);
      return condition.op === "notIn" ? !positive : positive;
    }
    case "contact.locality":
      return applyNot(condition.op, !!c.gnaf && condition.values.includes(c.gnaf.locality));
    case "contact.turf":
      return applyNot(condition.op, !!c.turfId && condition.values.includes(c.turfId));
    case "contact.supportLevel":
      return applyNot(
        condition.op,
        (c.dispositions ?? []).some((d) => d.supportLevel && condition.values.includes(d.supportLevel)),
      );
    case "contact.hasEmail": {
      const positive = condition.value ? c.email != null : c.email == null;
      return condition.op === "isNot" ? !positive : positive;
    }
    case "contact.hasPhone": {
      const positive = condition.value ? c.phoneE164 != null : c.phoneE164 == null;
      return condition.op === "isNot" ? !positive : positive;
    }
    case "contact.emailDomain": {
      const norm = condition.value.replace(/^@/, "").toLowerCase();
      return condition.op === "eq"
        ? !!c.email?.toLowerCase().endsWith(`@${norm}`)
        : !!c.email?.toLowerCase().includes(norm);
    }
    case "contact.createdAt":
      return dateHit([c.createdAt], condition as never);
    case "tag.tagged":
      return applyNot(condition.op, (c.tags ?? []).some((t) => condition.values.includes(t)));
    case "consent.sms":
      return applyNot(
        condition.op,
        (c.consents ?? []).some((k) => k.channel === "SMS" && condition.values.includes(k.state)),
      );
    case "consent.whatsapp":
      return applyNot(
        condition.op,
        (c.consents ?? []).some((k) => k.channel === "WHATSAPP" && condition.values.includes(k.state)),
      );
    case "source.system":
      return applyNot(condition.op, (c.sources ?? []).some((s) => condition.values.includes(s)));
    case "activity.lastActiveWithin": {
      const ats = [
        ...(c.doorKnocks ?? []),
        ...(c.responses ?? []).map((r) => r.at),
        ...(c.rsvps ?? []).map((r) => r.at),
        ...(c.replies ?? []).map((r) => r.at),
      ];
      return dateHit(ats, condition as never);
    }
    case "canvass.doorKnockedAt":
      return dateHit(c.doorKnocks ?? [], condition as never);
    case "canvass.dispositionCode":
      return applyNot(
        condition.op,
        (c.dispositions ?? []).some((d) => condition.values.includes(d.code)),
      );
    case "survey.responded":
      return applyNot(
        condition.op,
        (c.responses ?? []).some((r) => r.surveyId === condition.surveyId),
      );
    case "survey.answered":
      return applyNot(
        condition.op,
        (c.responses ?? []).some(
          (r) =>
            r.questionId === condition.questionId &&
            ((r.optionValue && condition.values.includes(r.optionValue)) ||
              (r.valueText && condition.values.includes(r.valueText))),
        ),
      );
    case "event.rsvped": {
      const statuses = condition.statuses ?? ["GOING", "ATTENDED"];
      return applyNot(
        condition.op,
        (c.rsvps ?? []).some(
          (r) => (!condition.eventId || r.eventId === condition.eventId) && statuses.includes(r.status),
        ),
      );
    }
    case "blast.received": {
      const since = condition.withinDays ? new Date(NOW - condition.withinDays * 86_400_000) : null;
      return applyNot(
        condition.op,
        (c.blastsReceived ?? []).some(
          (b) => (!condition.blastId || b.blastId === condition.blastId) && (!since || b.sentAt >= since),
        ),
      );
    }
    case "blast.replied": {
      const since = condition.withinDays ? new Date(NOW - condition.withinDays * 86_400_000) : null;
      return applyNot(
        condition.op,
        (c.replies ?? []).some(
          (r) => (!condition.blastId || r.blastId === condition.blastId) && (!since || r.at >= since),
        ),
      );
    }
    case "journey.enrolled": {
      const states = condition.states ?? ["ACTIVE"];
      return applyNot(
        condition.op,
        (c.journeys ?? []).some(
          (j) => (!condition.journeyId || j.journeyId === condition.journeyId) && states.includes(j.state),
        ),
      );
    }
    case "email.openedAt":
      return dateHit((c.emails ?? []).map((e) => e.openedAt).filter((d): d is Date => !!d), condition as never);
    case "email.clickedAt":
      return dateHit((c.emails ?? []).map((e) => e.clickedAt).filter((d): d is Date => !!d), condition as never);
    case "geo.area":
      return applyNot(condition.op, !!c.gnaf?.ced && condition.values.includes(c.gnaf.ced));
    case "compliance.channelConsent":
      return condition.channel === "WHATSAPP"
        ? (c.consents ?? []).some((k) => k.channel === "WHATSAPP" && k.state === "OPTED_IN")
        : !(c.consents ?? []).some((k) => k.channel === "SMS" && k.state === "OPTED_OUT");
    case "compliance.notSuppressed":
      return !c.suppressed;
    case "compliance.reachable":
      return c.phoneE164 != null;
    default:
      return false; // fail-closed, like the resolver
  }
}

const applyNot = (op: string, positive: boolean): boolean =>
  op === "notIn" || op === "isNot" ? !positive : positive;

function oracleFold(node: FilterNode | { kind: string; children?: unknown[] }, c: FixtureContact): boolean {
  const n = node as FilterNode;
  if (n.kind === "condition") return oracleMatches(c, n.condition);
  const kids = n.children.map((child) => oracleFold(child, c));
  if (n.kind === "all") return kids.every(Boolean);
  if (n.kind === "any") return kids.some(Boolean);
  return !kids.some(Boolean); // none
}

/** Oracle over the composed layers: L1 tree + optional policy + optional floor. */
function oracleEvaluate(filter: FilterNode, policy: SegmentPolicy, channel: "SMS" | "WHATSAPP"): Set<string> {
  const out = new Set<string>();
  for (const c of FIXTURE) {
    if (!oracleFold(filter, c)) continue;
    if (policy.fatigue.enabled) {
      const windowStart = new Date(NOW - policy.fatigue.windowHours * 3_600_000);
      const sends = (c.blastsReceived ?? []).filter((b) => b.sentAt >= windowStart).length;
      if (sends >= policy.fatigue.maxSends) continue;
    }
    if (policy.isActive.enabled && !oracleFold(policy.isActive.predicate, c)) continue;
    // L3 floor
    if (channel === "WHATSAPP") {
      if (!(c.consents ?? []).some((k) => k.channel === "WHATSAPP" && k.state === "OPTED_IN")) continue;
    } else if ((c.consents ?? []).some((k) => k.channel === "SMS" && k.state === "OPTED_OUT")) continue;
    if (c.suppressed) continue;
    if (c.phoneE164 == null) continue;
    out.add(c.id);
  }
  return out;
}

// ── the battery ──────────────────────────────────────────────────────────────
const leaf = (condition: Condition): FilterNode => ({ kind: "condition", condition });
const all = (...children: FilterNode[]): FilterNode => ({ kind: "all", children });
const any = (...children: FilterNode[]): FilterNode => ({ kind: "any", children });
const none = (...children: FilterNode[]): FilterNode => ({ kind: "none", children });

const BATTERY: Array<{ name: string; filter: FilterNode }> = [
  { name: "state in", filter: leaf({ type: "contact.state", op: "in", values: ["NSW"] }) },
  { name: "state notIn", filter: leaf({ type: "contact.state", op: "notIn", values: ["NSW"] }) },
  { name: "postcode eq", filter: leaf({ type: "contact.postcode", op: "eq", value: "2000" }) },
  { name: "locality in", filter: leaf({ type: "contact.locality", op: "in", values: ["Sydney", "Brisbane"] }) },
  { name: "turf in", filter: leaf({ type: "contact.turf", op: "in", values: ["t1"] }) },
  { name: "supportLevel in", filter: leaf({ type: "contact.supportLevel", op: "in", values: ["STRONG_SUPPORT", "LEAN_OPPOSE"] }) },
  { name: "hasEmail true", filter: leaf({ type: "contact.hasEmail", op: "is", value: true }) },
  { name: "hasPhone false", filter: leaf({ type: "contact.hasPhone", op: "is", value: false }) },
  { name: "emailDomain eq", filter: leaf({ type: "contact.emailDomain", op: "eq", value: "getup.org.au" }) },
  { name: "createdAt within", filter: leaf({ type: "contact.createdAt", op: "within", days: 30 }) },
  { name: "tagged", filter: leaf({ type: "tag.tagged", op: "in", values: ["tag_climate"] }) },
  { name: "tagged notIn", filter: leaf({ type: "tag.tagged", op: "notIn", values: ["tag_union"] }) },
  { name: "consent sms opted-in", filter: leaf({ type: "consent.sms", op: "in", values: ["OPTED_IN"] }) },
  { name: "source", filter: leaf({ type: "source.system", op: "in", values: ["csv", "action_network"] }) },
  { name: "active within 30", filter: leaf({ type: "activity.lastActiveWithin", op: "within", days: 30 }) },
  { name: "door knocked within 30", filter: leaf({ type: "canvass.doorKnockedAt", op: "within", days: 30 }) },
  { name: "disposition code", filter: leaf({ type: "canvass.dispositionCode", op: "in", values: ["MEANINGFUL"] }) },
  { name: "survey responded", filter: leaf({ type: "survey.responded", op: "is", surveyId: "s1" }) },
  { name: "survey answered", filter: leaf({ type: "survey.answered", questionId: "q1", op: "in", values: ["yes", "maybe"] }) },
  { name: "rsvped e1", filter: leaf({ type: "event.rsvped", op: "is", eventId: "e1" }) },
  { name: "rsvped any attended", filter: leaf({ type: "event.rsvped", op: "is", statuses: ["ATTENDED"] }) },
  { name: "blast received b1", filter: leaf({ type: "blast.received", op: "is", blastId: "b1" }) },
  { name: "blast received within 3d", filter: leaf({ type: "blast.received", op: "is", withinDays: 3 }) },
  { name: "blast replied", filter: leaf({ type: "blast.replied", op: "is" }) },
  { name: "journey active j1", filter: leaf({ type: "journey.enrolled", op: "is", journeyId: "j1" }) },
  { name: "email opened within 7", filter: leaf({ type: "email.openedAt", op: "within", days: 7 }) },
  { name: "email clicked within 7", filter: leaf({ type: "email.clickedAt", op: "within", days: 7 }) },
  { name: "geo ced", filter: leaf({ type: "geo.area", areaType: "ced", op: "in", values: ["CED_SYD", "CED_BNE"] }) },
  {
    name: "all(state, tagged)",
    filter: all(
      leaf({ type: "contact.state", op: "in", values: ["NSW"] }),
      leaf({ type: "tag.tagged", op: "in", values: ["tag_climate"] }),
    ),
  },
  {
    name: "any(turf t1, rsvped)",
    filter: any(
      leaf({ type: "contact.turf", op: "in", values: ["t1"] }),
      leaf({ type: "event.rsvped", op: "is" }),
    ),
  },
  {
    name: "all(hasPhone, none(opted-out sms))",
    filter: all(
      leaf({ type: "contact.hasPhone", op: "is", value: true }),
      none(leaf({ type: "consent.sms", op: "in", values: ["OPTED_OUT"] })),
    ),
  },
  {
    name: "nested any within all",
    filter: all(
      leaf({ type: "contact.createdAt", op: "within", days: 365 }),
      any(
        leaf({ type: "canvass.doorKnockedAt", op: "within", days: 30 }),
        leaf({ type: "email.openedAt", op: "within", days: 30 }),
        leaf({ type: "blast.replied", op: "is" }),
      ),
    ),
  },
  { name: "empty all (everyone)", filter: all() },
  { name: "empty any (no one)", filter: any() },
];

// ── run both worlds ──────────────────────────────────────────────────────────
async function engineEvaluate(
  filter: FilterNode,
  policy: SegmentPolicy,
  channel: "SMS" | "WHATSAPP",
): Promise<Set<string>> {
  const prisma = fakePrisma() as never;
  const logger = { debug: jest.fn(), warn: jest.fn() } as never;
  const insights = { resolvePollThresholdToGeoCodes: jest.fn(async () => []) } as never;
  const customQuery = { resolveContacts: jest.fn(async () => ({ ok: true, reasons: [], contactIds: [] })) } as never;
  const resolver = new SegmentLeafResolverService(prisma, logger, insights, customQuery);

  const composed = composeEffectiveTree({ filter, policy }, "blast", { channel });
  const universe = await resolver.universe("t1");
  const { resolved } = await resolver.resolveLeaves(
    "t1",
    collectEffectiveLeaves(composed.tree),
    universe,
    {},
  );
  return foldEffectiveTree(composed.tree, (l) => resolved.get(l) ?? new Set(), universe);
}

describe("fold-equivalence oracle — real resolvers ≡ naive per-contact interpreter", () => {
  const policyOff = DEFAULT_SEGMENT_POLICY;

  for (const { name, filter } of BATTERY) {
    it(`battery: ${name}`, async () => {
      const engine = await engineEvaluate(filter, policyOff, "SMS");
      const oracle = oracleEvaluate(filter, policyOff, "SMS");
      expect([...engine].sort()).toEqual([...oracle].sort());
    });
  }

  it("policy: fatigue excludes the over-cap contact (c8)", async () => {
    const policy: SegmentPolicy = {
      fatigue: { enabled: true, windowHours: 72, maxSends: 3 },
      isActive: { enabled: false, predicate: DEFAULT_SEGMENT_POLICY.isActive.predicate },
    };
    const filter = all();
    const engine = await engineEvaluate(filter, policy, "SMS");
    const oracle = oracleEvaluate(filter, policy, "SMS");
    expect([...engine].sort()).toEqual([...oracle].sort());
    expect(engine.has("c8")).toBe(false);
  });

  it("policy: isActive shapes to recently-engaged contacts", async () => {
    const policy: SegmentPolicy = {
      fatigue: { enabled: false, windowHours: 72, maxSends: 3 },
      isActive: {
        enabled: true,
        predicate: leaf({ type: "activity.lastActiveWithin", op: "within", days: 30 }),
      },
    };
    const filter = all();
    const engine = await engineEvaluate(filter, policy, "SMS");
    const oracle = oracleEvaluate(filter, policy, "SMS");
    expect([...engine].sort()).toEqual([...oracle].sort());
  });

  it("compliance: the WhatsApp floor requires opt-in; SMS floor excludes opt-outs + suppressed + phoneless", async () => {
    const filter = all();
    for (const channel of ["SMS", "WHATSAPP"] as const) {
      const engine = await engineEvaluate(filter, policyOff, channel);
      const oracle = oracleEvaluate(filter, policyOff, channel);
      expect([...engine].sort()).toEqual([...oracle].sort());
    }
    const sms = await engineEvaluate(filter, policyOff, "SMS");
    expect(sms.has("c2")).toBe(false); // opted out + suppressed + no phone
    expect(sms.has("c6")).toBe(false); // suppressed
    const wa = await engineEvaluate(filter, policyOff, "WHATSAPP");
    expect([...wa].sort()).toEqual(["c3", "c7"]); // the only WhatsApp opt-ins
  });

  it("golden order parity: engine sets order identically under the shared hash", async () => {
    const engine = await engineEvaluate(all(), policyOff, "SMS");
    const oracle = oracleEvaluate(all(), policyOff, "SMS");
    expect(orderByHash(engine, "seed-x")).toEqual(orderByHash(oracle, "seed-x"));
  });
});
