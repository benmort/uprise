/**
 * The v2 definition-envelope runtime authority (adapted from slingshot's
 * segment-definition.schema.ts) — `SegmentPolicySchema` + the envelope schema +
 * the format detector the evaluator routes on.
 *
 * `AudienceSegment.definition` (jsonb) holds either a legacy clause object (no
 * `format` key — evaluated by the legacy clause evaluator forever) or this v2
 * envelope. Detection is shape-based; no discriminator column.
 */
import { z } from "zod";
import type { SegmentDefinitionV2 } from "../types/segment-definition.types";
import { FilterNodeSchema } from "./filter.schema";

/** Fatigue window bounds — 1 hour to 90 days; a cap of 1–100 sends. */
const FatigueSchema = z
  .object({
    enabled: z.boolean(),
    windowHours: z.number().int().min(1).max(2160),
    maxSends: z.number().int().min(1).max(100),
  })
  .strict();

/** Layer-2 policy — fatigue + the embedded (by-value) active predicate. */
export const SegmentPolicySchema = z
  .object({
    fatigue: FatigueSchema,
    isActive: z
      .object({
        enabled: z.boolean(),
        predicate: FilterNodeSchema,
      })
      .strict(),
  })
  .strict();

/** An envelope-held AI custom clause (the SQL lane). Predicate re-validated at every use. */
export const SegmentCustomClauseSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(200),
    intent: z.string().min(1).max(2000),
    predicate: z.string().min(1).max(4000),
  })
  .strict();

/** The v2 envelope stored in `AudienceSegment.definition`. */
export const SegmentDefinitionV2Schema: z.ZodType<SegmentDefinitionV2> = z
  .object({
    format: z.literal(2),
    filter: FilterNodeSchema,
    policy: SegmentPolicySchema,
    customClauses: z.array(SegmentCustomClauseSchema).max(20).optional(),
  })
  .strict() as unknown as z.ZodType<SegmentDefinitionV2>;

/** Which evaluator a stored definition routes to. */
export type DefinitionFormat = "legacy" | "v2";

/**
 * Shape-detect a stored definition: a `format: 2` object is the v2 envelope;
 * anything else (legacy clause objects, `{ include: … }` wrappers, null) is
 * legacy. Detection only — parse with {@link SegmentDefinitionV2Schema} before
 * trusting the contents.
 */
export const detectDefinitionFormat = (definition: unknown): DefinitionFormat =>
  typeof definition === "object" &&
  definition !== null &&
  !Array.isArray(definition) &&
  (definition as { format?: unknown }).format === 2
    ? "v2"
    : "legacy";
