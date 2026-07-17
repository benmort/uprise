import { type Expr, parse, type SelectFromStatement } from "pgsql-ast-parser";

/**
 * Validates an AI-authored custom-query predicate before it is ever executed
 * (ported from the slingshot prototype's custom-query-predicate.validator).
 *
 * We never run free-form SQL: the service owns the envelope
 * `SELECT contact_id FROM audience.contacts_safe WHERE tenant_id = $1 AND
 * (<predicate>) LIMIT <n>` and the model only supplies the boolean
 * `<predicate>`. The tenant filter is the EXECUTOR's, spliced server-side and
 * bound as a parameter — never model-authored. This validator parses that
 * *whole* envelope (so any breakout attempt — `UNION`, `;`, a trailing `--`
 * comment, a subquery — fails the single-clean-SELECT shape check) and walks
 * the WHERE tree against a column + function allowlist.
 *
 * This is the first of three layers; the masked view (`contacts_safe`, no PII)
 * and the read-only role + READ ONLY transaction (`uprise_segment_query_ro`)
 * are the other two. Validation gives precise UX errors and blocks obvious
 * abuse; the role/txn are the hard backstop.
 */

/** The only columns a predicate may reference — exactly the masked view's surface. */
export const CONTACTS_SAFE_COLUMNS = [
  "contact_id",
  "tenant_id",
  "has_email",
  "has_phone",
  "email_domain",
  "created_at",
  "turf_id",
  "state",
  "postcode",
  "locality",
] as const;

export const CONTACTS_SAFE_RELATION = "audience.contacts_safe";

/** Functions the predicate may call — small, side-effect-free, no data access. */
const ALLOWED_FUNCTIONS = new Set([
  "now",
  "current_date",
  "current_timestamp",
  "lower",
  "upper",
  "length",
  "date_trunc",
  "coalesce",
]);

const ALLOWED_COLUMN_SET = new Set<string>(CONTACTS_SAFE_COLUMNS);

export interface PredicateValidation {
  ok: boolean;
  /** Human-readable reasons the predicate was rejected (empty when ok). */
  reasons: string[];
  /** The exact SQL the executor should run (with `$1` = tenantId) — only meaningful when ok. */
  sql: string;
}

/** Build the fixed envelope the executor runs. The predicate is the only model-supplied part. */
export function buildContactsSafeQuery(predicate: string, limit: number): string {
  return `select contact_id from audience.contacts_safe where tenant_id = $1 and (${predicate}) limit ${limit}`;
}

/**
 * Parse + validate the envelope. Returns `ok: false` with reasons on any parse
 * error or disallowed construct; returns the executable `sql` when safe.
 */
export function validateContactsSafePredicate(
  predicate: string,
  limit: number,
): PredicateValidation {
  const reasons: string[] = [];
  const trimmed = predicate.trim();
  if (!trimmed) return { ok: false, reasons: ["Predicate is empty."], sql: "" };

  const sql = buildContactsSafeQuery(trimmed, limit);

  let statements: ReturnType<typeof parse>;
  try {
    statements = parse(sql);
  } catch (error) {
    return {
      ok: false,
      reasons: [
        `Could not parse predicate: ${error instanceof Error ? error.message : "unknown"}`,
      ],
      sql: "",
    };
  }

  if (statements.length !== 1) {
    return { ok: false, reasons: ["Predicate must be a single boolean expression."], sql: "" };
  }
  const stmt = statements[0];
  // A clean envelope narrows to a plain SELECT…FROM. A UNION / WITH / VALUES breakout
  // parses to a different statement type and is rejected here.
  if (stmt.type !== "select") {
    return { ok: false, reasons: ["Predicate must be a single boolean expression."], sql: "" };
  }
  const select = stmt;

  // Envelope must be exactly our shape — catches extra columns / table swaps / breakout.
  validateEnvelope(select, reasons);

  if (select.where) walkExpr(select.where, reasons);
  else reasons.push("Predicate produced no WHERE clause.");

  return reasons.length > 0
    ? { ok: false, reasons: dedupe(reasons), sql: "" }
    : { ok: true, reasons: [], sql };
}

function validateEnvelope(select: SelectFromStatement, reasons: string[]): void {
  const from = select.from ?? [];
  if (from.length !== 1 || from[0]?.type !== "table") {
    reasons.push("Predicate may only query the contacts view.");
  } else {
    const name = from[0].name;
    const rel = `${name.schema ? `${name.schema}.` : ""}${name.name}`;
    if (rel !== CONTACTS_SAFE_RELATION && name.name !== "contacts_safe") {
      reasons.push(`Predicate may only reference ${CONTACTS_SAFE_RELATION}.`);
    }
  }
  // The projection is ours (contact_id) — anything else means the predicate broke out of the WHERE.
  const cols = select.columns ?? [];
  const onlyContactId =
    cols.length === 1 && cols[0]?.expr.type === "ref" && cols[0].expr.name === "contact_id";
  if (!onlyContactId) reasons.push("Predicate altered the query projection.");
}

/** Recursively validate a WHERE expression: allowlisted columns/functions, no subqueries. */
function walkExpr(node: Expr, reasons: string[]): void {
  switch (node.type) {
    case "ref": {
      const col = node.name.toLowerCase();
      if (col === "*") reasons.push("Wildcard column is not allowed.");
      else if (!ALLOWED_COLUMN_SET.has(col)) reasons.push(`Unknown or disallowed column: ${col}`);
      return;
    }
    case "string":
    case "numeric":
    case "integer":
    case "boolean":
    case "null":
    case "constant":
    case "parameter":
      return;
    case "keyword": {
      const kw = node.keyword.toLowerCase();
      const safe = [
        "current_date",
        "current_timestamp",
        "current_time",
        "localtimestamp",
        "localtime",
      ];
      if (!safe.includes(kw)) reasons.push(`Keyword not allowed: ${kw}`);
      return;
    }
    case "binary":
      walkExpr(node.left, reasons);
      walkExpr(node.right, reasons);
      return;
    case "unary":
      walkExpr(node.operand, reasons);
      return;
    case "ternary":
      walkExpr(node.value, reasons);
      walkExpr(node.lo, reasons);
      walkExpr(node.hi, reasons);
      return;
    case "list":
    case "array":
      node.expressions.forEach((e) => walkExpr(e, reasons));
      return;
    case "cast":
      walkExpr(node.operand, reasons);
      return;
    case "call": {
      const fn = node.function.name.toLowerCase();
      if (!ALLOWED_FUNCTIONS.has(fn)) reasons.push(`Function not allowed: ${fn}()`);
      node.args.forEach((a) => walkExpr(a, reasons));
      return;
    }
    case "select":
      reasons.push("Subqueries are not allowed in a custom-query predicate.");
      return;
    default:
      reasons.push(`Unsupported expression in predicate: ${(node as { type: string }).type}`);
  }
}

const dedupe = (xs: string[]): string[] => [...new Set(xs)];
