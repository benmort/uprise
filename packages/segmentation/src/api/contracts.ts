/**
 * The segments API surface types — what `/segments/*` returns and accepts.
 * Owned by the segmentation package (the slingshot pattern: the domain package
 * owns its admin contracts) and consumed by the admin app via `@/lib/api`.
 */
import type { SegmentationContext } from "../composition/context-model";
import type { CatalogueEntry, CatalogueOption } from "../catalogue/catalogue.types";
import type { FilterNode } from "../definition/types/filter.types";
import type {
  SegmentCustomClause,
  SegmentPolicy,
} from "../definition/types/segment-definition.types";
import type { SegmentPreview } from "../evaluation/preview.types";
import type { ResidualClause } from "../ai/normalise";

/** A list-row summary of a v2 segment definition. */
export interface SegmentSummary {
  id: string;
  audienceId: string;
  name: string;
  version: number;
  archived: boolean;
  lastEvaluatedAt: string | Date | null;
  memberCount: number;
  /** Plain-English description of the filter (describeTree). */
  summary: string;
  policy: SegmentPolicy | null;
  customClauseCount: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** The full definition detail the builder edits. */
export interface SegmentDetail extends SegmentSummary {
  filter: FilterNode;
  policy: SegmentPolicy;
  customClauses: SegmentCustomClause[];
}

/** A question feed row carries its survey + answer options for the picker. */
export interface QuestionFeedOption extends CatalogueOption {
  surveyId: string;
  options: CatalogueOption[];
}

/** The per-tenant entity-picker feeds served with the catalogue. */
export interface SegmentEntityFeeds {
  tags: CatalogueOption[];
  turfs: CatalogueOption[];
  surveys: CatalogueOption[];
  questions: QuestionFeedOption[];
  events: CatalogueOption[];
  blasts: CatalogueOption[];
  journeys: CatalogueOption[];
  dispositions: CatalogueOption[];
  sources: CatalogueOption[];
}

/** GET /segments/catalogue. */
export interface SegmentCatalogueResponse {
  version: number;
  context: SegmentationContext;
  contextStatus: "active" | "gated";
  sections: Array<{ group: string; entries: CatalogueEntry[] }>;
  feeds: SegmentEntityFeeds;
}

/** POST /segments + PATCH /segments/:id bodies. */
export interface SaveSegmentRequest {
  name?: string;
  channel?: "SMS" | "WHATSAPP" | "ALL";
  filter?: FilterNode;
  policy?: SegmentPolicy;
  customClauses?: SegmentCustomClause[];
}

/** POST /segments/preview body. */
export interface PreviewSegmentRequest {
  filter: FilterNode;
  policy?: SegmentPolicy;
  customClauses?: SegmentCustomClause[];
  channel?: "SMS" | "WHATSAPP";
  seed?: string;
}

/** POST /segments/generate response — the AI (or keyword-fallback) authoring result. */
export interface GenerateSegmentResponse {
  name: string;
  tree: FilterNode;
  summary: string;
  customClauses: ResidualClause[];
}

/** POST /segments/custom-query/compile response. */
export interface CompileCustomQueryResponse {
  status: "ok" | "needs-review" | "unsupported";
  predicate: string | null;
  reasons: string[];
  count: number | null;
}

export type { SegmentPreview };
