/**
 * The closed runtime authority for {@link Condition} (ported from slingshot's
 * condition.schema.ts, roster re-cut for uprise) — a `z.union` of per-(type,
 * op-shape) `.strict()` variants. Deliberately NOT a `discriminatedUnion`: a
 * date/number type needs several op-shapes under one `type`, so the variants
 * discriminate on `(type, op)` pairs instead.
 *
 * Operand bounds guard the untrusted contract boundary: value-set size, string
 * length, day windows. `.strict()` everywhere — an unexpected key is a rejection,
 * never silently carried.
 */
import { z } from "zod";
import {
  COMPLIANCE_CHANNELS,
  GEO_AREA_TYPES,
  POLL_THRESHOLD_OPS,
  type Condition,
} from "../types/condition.types";

/** Max entries in one `values` set. */
export const MAX_CONDITION_VALUES = 1000;
/** Max length of any single operand string. */
export const MAX_OPERAND_VALUE_LENGTH = 512;
/** Max rolling-window days (10 years). */
export const MAX_WINDOW_DAYS = 3650;

const operand = z.string().min(1).max(MAX_OPERAND_VALUE_LENGTH);
const valueSet = z.array(operand).min(1).max(MAX_CONDITION_VALUES);
const isoInstant = operand.refine((s) => !Number.isNaN(Date.parse(s)), "must be a parseable date");
const windowDays = z.number().int().positive().max(MAX_WINDOW_DAYS);
const idRef = z.string().min(1).max(MAX_OPERAND_VALUE_LENGTH);

// --- dataType-generic variant builders --------------------------------------------

const enumVariant = <T extends string>(type: T) =>
  z.object({ type: z.literal(type), op: z.enum(["in", "notIn"]), values: valueSet }).strict();

const boolVariant = <T extends string>(type: T) =>
  z.object({ type: z.literal(type), op: z.enum(["is", "isNot"]), value: z.boolean() }).strict();

const stringVariant = <T extends string>(type: T) =>
  z.object({ type: z.literal(type), op: z.enum(["eq", "contains"]), value: operand }).strict();

const dateVariants = <T extends string>(type: T) => [
  z.object({ type: z.literal(type), op: z.literal("within"), days: windowDays }).strict(),
  z.object({ type: z.literal(type), op: z.enum(["before", "after"]), date: isoInstant }).strict(),
  z
    .object({ type: z.literal(type), op: z.literal("between"), from: isoInstant, to: isoInstant })
    .strict(),
];

// --- the closed union (every (type, op-shape) variant) ------------------------------

export const ConditionSchema: z.ZodType<Condition> = z.union([
  // contact — enums
  enumVariant("contact.state"),
  enumVariant("contact.locality"),
  enumVariant("contact.turf"),
  enumVariant("contact.supportLevel"),
  // contact.postcode — set or exact
  enumVariant("contact.postcode"),
  z.object({ type: z.literal("contact.postcode"), op: z.literal("eq"), value: operand }).strict(),
  // contact — bools / string / date
  boolVariant("contact.hasEmail"),
  boolVariant("contact.hasPhone"),
  stringVariant("contact.emailDomain"),
  ...dateVariants("contact.createdAt"),
  // tag / consent / source
  enumVariant("tag.tagged"),
  enumVariant("consent.sms"),
  enumVariant("consent.whatsapp"),
  enumVariant("source.system"),
  // activity — dates + disposition enum
  ...dateVariants("activity.lastActiveWithin"),
  ...dateVariants("canvass.doorKnockedAt"),
  enumVariant("canvass.dispositionCode"),
  ...dateVariants("email.openedAt"),
  ...dateVariants("email.clickedAt"),
  // activity — bespoke verbs
  z
    .object({ type: z.literal("survey.responded"), op: z.enum(["is", "isNot"]), surveyId: idRef })
    .strict(),
  z
    .object({
      type: z.literal("survey.answered"),
      questionId: idRef,
      op: z.enum(["in", "notIn"]),
      values: valueSet,
    })
    .strict(),
  z
    .object({
      type: z.literal("event.rsvped"),
      op: z.enum(["is", "isNot"]),
      eventId: idRef.optional(),
      statuses: z.array(operand).min(1).max(8).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("blast.received"),
      op: z.enum(["is", "isNot"]),
      blastId: idRef.optional(),
      withinDays: windowDays.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("blast.replied"),
      op: z.enum(["is", "isNot"]),
      blastId: idRef.optional(),
      withinDays: windowDays.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("journey.enrolled"),
      op: z.enum(["is", "isNot"]),
      journeyId: idRef.optional(),
      states: z.array(operand).min(1).max(8).optional(),
    })
    .strict(),
  // geo / insights
  z
    .object({
      type: z.literal("geo.area"),
      areaType: z.enum(GEO_AREA_TYPES),
      op: z.enum(["in", "notIn"]),
      values: valueSet,
    })
    .strict(),
  z
    .object({
      type: z.literal("insights.pollThreshold"),
      pollId: idRef,
      questionCode: idRef,
      response: idRef,
      op: z.enum(POLL_THRESHOLD_OPS),
      value: z.number().finite(),
      geoKind: z.enum(GEO_AREA_TYPES),
    })
    .strict(),
  // custom — envelope clause reference
  z.object({ type: z.literal("custom.clause"), clauseRef: idRef }).strict(),
  // compliance — L3 only (valid Condition shapes; refused in authored L1)
  z
    .object({ type: z.literal("compliance.channelConsent"), channel: z.enum(COMPLIANCE_CHANNELS) })
    .strict(),
  z
    .object({ type: z.literal("compliance.notSuppressed"), channel: z.enum(COMPLIANCE_CHANNELS) })
    .strict(),
  z
    .object({ type: z.literal("compliance.reachable"), channel: z.enum(COMPLIANCE_CHANNELS) })
    .strict(),
  // policy — L2 only
  z
    .object({
      type: z.literal("policy.isActive"),
      op: z.enum(["is", "isNot"]),
      policy: z.literal("org-default"),
    })
    .strict(),
]) as z.ZodType<Condition>;
