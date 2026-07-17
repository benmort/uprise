/**
 * Catalogue shapes (adapted from slingshot's catalogue.types.ts + the orphaned
 * prototype's ConditionRegistry UI hints) — the vocabulary of one catalogue
 * entry: what the condition is, which layer owns it, how the builder renders
 * it, and whether it is servable today.
 */
import type { ConditionLayer } from "../definition/types/condition-layer";

/** The condition families (drives builder grouping + resolver routing docs). */
export const CATALOGUE_KINDS = [
  "contact",
  "tag",
  "consent",
  "source",
  "activity",
  "geo",
  "insights",
  "custom",
  "compliance",
] as const;
export type CatalogueKind = (typeof CATALOGUE_KINDS)[number];

/**
 * Whether a catalogue entry is servable:
 * - `now` — fully wired; authorable and evaluated.
 * - `pending` — advertised in the builder ("coming soon", flagged) but refused
 *   on save by the capability gate.
 * - `gated` — declared for forward-compatibility; refused on save.
 */
export const CAPABILITIES = ["now", "pending", "gated"] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** How the builder collects the operand(s) for a condition. */
export const VALUE_INPUTS = [
  /** Multi-select over `options` / the `optionsFeed`. */
  "multi",
  /** Single-select over `options` / the `optionsFeed`. */
  "single",
  /** Free text. */
  "text",
  /** A number. */
  "number",
  /** A rolling day-window (within N days) with date-range alternatives. */
  "window",
  /** A boolean toggle. */
  "toggle",
  /** No operand (the condition is self-contained). */
  "none",
] as const;
export type ValueInput = (typeof VALUE_INPUTS)[number];

/** A static option for enum-ish entries. */
export interface CatalogueOption {
  value: string;
  label: string;
}

/**
 * A dynamic per-tenant option feed the API hydrates when serving the catalogue
 * (tag list, turf list, …). An entry carries either static `options` or a feed.
 */
export const OPTION_FEEDS = [
  "tags",
  "turfs",
  "surveys",
  "questions",
  "events",
  "blasts",
  "journeys",
  "dispositions",
  "sources",
] as const;
export type OptionFeed = (typeof OPTION_FEEDS)[number];

/** One catalogue entry — the single source the describe views project from. */
export interface CatalogueEntry {
  /**
   * The condition `type` this entry describes. For `now`/`pending` entries this
   * is a closed-union member; `gated` descriptors may name a future type that
   * is not yet in the union (they can never be saved).
   */
  type: string;
  kind: CatalogueKind;
  layer: ConditionLayer;
  /** The builder IA section this entry lives under. */
  group: string;
  label: string;
  description: string;
  /** Prompt-matching keywords (the AI keyword fallback + builder search). */
  keywords: string[];
  capability: Capability;
  /** The operator vocabulary, by dataType. */
  operators: string[];
  dataType: "enum" | "bool" | "string" | "date" | "bespoke";
  valueInput: ValueInput;
  options?: CatalogueOption[];
  optionsFeed?: OptionFeed;
  /** Builder accent colour token (the canvas condition-card tint). */
  accent?: string;
}
