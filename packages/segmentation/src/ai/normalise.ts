/**
 * The AI trust boundary (ported from the slingshot prototype's normalise.ts) —
 * turn a loose AI-produced tree into a valid, catalogue-snapped `FilterNode`.
 *
 * The AI is prompted from the catalogue, but we never trust its output: every
 * field/op/value is snapped to the real vocabulary, unknowns become **residual
 * clauses** (surfaced to the custom-query lane, never silently dropped), and
 * the final tree is validated via `validateAuthoredFilter` before return — so
 * unvalidated model output can never escape into a stored tree.
 *
 * Negative operators (e.g. "is not in") are compiled to a `none` wrapper around
 * the positive leaf, so the stored union carries positive params only where the
 * type has no native negative op.
 */
import type { Condition } from "../definition/types/condition.types";
import type { FilterNode } from "../definition/types/filter.types";
import { validateAuthoredFilter } from "../definition/validation/filter.schema";
import type { CatalogueEntry } from "../catalogue/catalogue.types";
import { UPRISE_CATALOGUE, findCatalogueEntry } from "../catalogue/uprise-catalogue";

interface LooseCondition {
  field?: string;
  op?: string;
  value?: unknown;
  /** Optional model-supplied label/intent used when a condition can't be snapped. */
  label?: string;
  intent?: string;
}

interface LooseGroup {
  match?: string;
  children?: unknown[];
  conditions?: unknown[];
}

/** A bit of intent the catalogue couldn't express — surfaced as a custom-query candidate. */
export interface ResidualClause {
  label: string;
  intent: string;
}

export interface NormaliseResult {
  tree: FilterNode;
  residual: ResidualClause[];
}

const EMPTY_ALL: FilterNode = { kind: "all", children: [] };

/** Case-insensitive catalogue resolution by type id or label — authorable `now` entries only. */
const resolveEntry = (field: string | undefined): CatalogueEntry | null => {
  if (!field) return null;
  const f = field.toLowerCase().trim();
  const direct = findCatalogueEntry(f) ?? findCatalogueEntry(field.trim());
  if (direct && direct.layer === "L1" && direct.capability === "now") return direct;
  const match = UPRISE_CATALOGUE.find(
    (e) =>
      e.layer === "L1" &&
      e.capability === "now" &&
      (e.type.toLowerCase() === f || e.label.toLowerCase() === f),
  );
  return match ?? null;
};

/** Snap raw values against an entry's static options; pass through free strings otherwise. */
const snapValues = (entry: CatalogueEntry, raw: unknown): string[] => {
  const arr = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const asStrings = arr.map((v) => String(v)).filter((v) => v.length > 0 && v.length <= 512);
  if (!entry.options || entry.options.length === 0) return [...new Set(asStrings)];
  const snapped = asStrings
    .map((v) => {
      const lc = v.toLowerCase();
      const exact = entry.options!.find(
        (o) => o.value.toLowerCase() === lc || o.label.toLowerCase() === lc,
      );
      if (exact) return exact.value;
      const partial = entry.options!.find(
        (o) =>
          o.label.toLowerCase().includes(lc) ||
          o.value.toLowerCase().includes(lc) ||
          lc.includes(o.value.toLowerCase()),
      );
      return partial ? partial.value : null;
    })
    .filter((v): v is string => Boolean(v));
  return [...new Set(snapped)];
};

/** Does the loose op read as a negation ("not in", "hasn't", "is not", "exclude")? */
const isNegation = (opRaw: string | undefined): boolean =>
  /\b(not|n't|exclude|without|never)\b/i.test(String(opRaw ?? ""));

const firstNumber = (raw: unknown): number | null => {
  const arr = Array.isArray(raw) ? raw : [raw];
  for (const v of arr) {
    const n = Number(String(v).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
};

/** Build a positive Condition (+ whether to wrap it in `none`) or null if unbuildable. */
const buildCondition = (
  entry: CatalogueEntry,
  opRaw: string | undefined,
  valueRaw: unknown,
): { condition: Condition; negate: boolean } | null => {
  const negate = isNegation(opRaw);
  const type = entry.type;

  switch (entry.dataType) {
    case "enum": {
      const values = snapValues(entry, valueRaw);
      if (!values.length) return null;
      return { condition: { type, op: "in", values } as Condition, negate };
    }
    case "bool": {
      const raw = String(Array.isArray(valueRaw) ? valueRaw[0] : (valueRaw ?? "true")).toLowerCase();
      const value = !["false", "no", "0"].includes(raw);
      return { condition: { type, op: "is", value } as Condition, negate };
    }
    case "string": {
      const value = String(Array.isArray(valueRaw) ? valueRaw[0] : (valueRaw ?? "")).trim();
      if (!value || value.length > 512) return null;
      return { condition: { type, op: "contains", value } as Condition, negate };
    }
    case "date": {
      const days = firstNumber(valueRaw);
      if (!days || days > 3650) return null;
      return { condition: { type, op: "within", days } as Condition, negate };
    }
    case "bespoke": {
      // Only the self-membership verbs are AI-buildable; entity-picker ids can't
      // be guessed by a model, so a bare "has done it" leaf is the safe snap.
      const values = snapValues(entry, valueRaw);
      switch (type) {
        case "survey.responded":
          return values.length
            ? { condition: { type, op: "is", surveyId: values[0] } as Condition, negate }
            : null;
        case "event.rsvped":
          return { condition: { type, op: "is" } as Condition, negate };
        case "blast.received":
        case "blast.replied":
          return { condition: { type, op: "is" } as Condition, negate };
        case "journey.enrolled":
          return { condition: { type, op: "is" } as Condition, negate };
        default:
          // geo.area / insights.pollThreshold / custom.clause need structured
          // operands a loose value can't supply — residual, never guessed.
          return null;
      }
    }
    default:
      return null;
  }
};

const isGroup = (n: unknown): n is LooseGroup =>
  typeof n === "object" && n != null && ("match" in n || "children" in n || "conditions" in n);

/**
 * Normalise a loose AI tree into a valid `FilterNode` + residual clauses. The
 * result ALWAYS passes `validateAuthoredFilter` (falls back to the empty `all`
 * group — "everyone" — when nothing snapped or validation failed).
 */
export function normaliseAiTree(raw: unknown): NormaliseResult {
  const residual: ResidualClause[] = [];

  const toResidual = (c: LooseCondition): ResidualClause => {
    const field = c.field ? String(c.field) : "condition";
    return {
      label: typeof c.label === "string" && c.label ? c.label.slice(0, 200) : field.slice(0, 200),
      intent:
        typeof c.intent === "string" && c.intent ? c.intent.slice(0, 2000) : field.slice(0, 2000),
    };
  };

  const visit = (node: unknown, depth: number): FilterNode | null => {
    if (isGroup(node)) {
      const match = node.match === "any" ? "any" : node.match === "none" ? "none" : "all";
      const kids = (node.children ?? node.conditions ?? [])
        .map((child) =>
          isGroup(child) ? (depth < 2 ? visit(child, depth + 1) : null) : visit(child, depth + 1),
        )
        .filter((c): c is FilterNode => c != null);
      return kids.length ? { kind: match, children: kids } : null;
    }
    if (typeof node !== "object" || node === null) return null;
    const c = node as LooseCondition;
    const entry = resolveEntry(c.field);
    if (!entry) {
      if (c.field || c.intent) residual.push(toResidual(c));
      return null;
    }
    const built = buildCondition(entry, c.op, c.value);
    if (!built) {
      residual.push(toResidual(c));
      return null;
    }
    const leaf: FilterNode = { kind: "condition", condition: built.condition };
    return built.negate ? { kind: "none", children: [leaf] } : leaf;
  };

  const root = visit(raw, 0);
  const tree: FilterNode =
    root == null ? EMPTY_ALL : root.kind === "condition" ? { kind: "all", children: [root] } : root;

  // The trust boundary: whatever we built must pass the authored-filter guard.
  const verdict = validateAuthoredFilter(tree);
  if (!verdict.ok) {
    return { tree: EMPTY_ALL, residual };
  }
  return { tree, residual };
}
