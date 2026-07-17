import Anthropic from "@anthropic-ai/sdk";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import {
  CONTACTS_SAFE_COLUMNS,
  validateContactsSafePredicate,
} from "./custom-query-predicate.validator";

/** Hard ceiling on a custom clause's resolved set, and the per-statement timeout (ms). */
export const CUSTOM_QUERY_ROW_CAP = 50_000;
const STATEMENT_TIMEOUT_MS = 3_000;
const COMPILE_MODEL = "claude-haiku-4-5";

export interface ResolveCustomQueryResult {
  ok: boolean;
  /** Rejection reasons (validation failures); empty when ok. */
  reasons: string[];
  /** Contact ids the predicate matched (capped); empty when not ok. */
  contactIds: string[];
}

export interface CompileCustomClauseResult {
  status: "ok" | "needs-review" | "unsupported";
  predicate: string | null;
  reasons: string[];
  count: number | null;
}

/**
 * The AI custom-query lane (ported from the slingshot prototype) — resolves an
 * AI-authored predicate to a contact-id set.
 *
 * Three layers of containment, in order: (1) {@link validateContactsSafePredicate}
 * parses + checks the predicate against a column/function allowlist inside the
 * fixed envelope (which ANDs the executor's own `tenant_id = $1` filter — never
 * model-authored); (2) execution runs `SET LOCAL ROLE uprise_segment_query_ro`,
 * which can only SELECT the masked `audience.contacts_safe` view (no base
 * tables, no PII); (3) it runs inside a READ ONLY transaction with a statement
 * timeout + row cap. The generated SQL is never trusted from storage — the
 * evaluator re-validates on EVERY run and feeds the resolved id set to the fold
 * as an injected set (fail-closed ∅ on any rejection).
 */
@Injectable()
export class CustomQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: DomainLogger,
  ) {}

  /**
   * Turn a clause intent into a validated, counted predicate: compile (Claude) →
   * validate (AST) → count (read-only execution). Returns the status the UI
   * shows: `ok` (predicate + reach count), `needs-review` (compiled but failed
   * validation), or `unsupported` (couldn't compile / AI off).
   */
  async compileCustomClause(tenantId: string, intent: string): Promise<CompileCustomClauseResult> {
    const predicate = await this.compilePredicate(intent);
    if (!predicate || predicate.toUpperCase() === "UNSUPPORTED") {
      return {
        status: "unsupported",
        predicate: null,
        reasons: ["Could not express this with the available contact fields."],
        count: null,
      };
    }
    const validation = validateContactsSafePredicate(predicate, CUSTOM_QUERY_ROW_CAP);
    if (!validation.ok) {
      return { status: "needs-review", predicate, reasons: validation.reasons, count: null };
    }
    const resolved = await this.resolveContacts(tenantId, predicate);
    if (!resolved.ok) {
      return { status: "needs-review", predicate, reasons: resolved.reasons, count: null };
    }
    return { status: "ok", predicate, reasons: [], count: resolved.contactIds.length };
  }

  /** Validate + execute a predicate under the read-only role; returns the matched contact ids. */
  async resolveContacts(tenantId: string, predicate: string): Promise<ResolveCustomQueryResult> {
    const validation = validateContactsSafePredicate(predicate, CUSTOM_QUERY_ROW_CAP);
    if (!validation.ok) {
      return { ok: false, reasons: validation.reasons, contactIds: [] };
    }

    try {
      const contactIds = await this.prisma.$transaction(async (tx) => {
        // Order matters: READ ONLY must precede any query in the transaction.
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
        await tx.$executeRawUnsafe("SET LOCAL ROLE uprise_segment_query_ro");
        const rows = (await tx.$queryRawUnsafe(validation.sql, tenantId)) as Array<{
          contact_id: string;
        }>;
        return rows.map((r) => r.contact_id);
      });
      return { ok: true, reasons: [], contactIds };
    } catch (error) {
      // Timeout / permission / plan errors: fail closed with a surfaced reason.
      const message = error instanceof Error ? error.message : "query failed";
      this.logger.warn("audience", "custom-query execution failed", { tenantId, message });
      return { ok: false, reasons: [`Query failed: ${message}`], contactIds: [] };
    }
  }

  /**
   * Turn a natural-language intent into a candidate SQL predicate over the
   * masked view, via Claude (flag-gated). The result is NOT trusted — callers
   * must still run it through `resolveContacts`, which re-validates. Returns
   * null when AI is disabled or on error.
   */
  async compilePredicate(intent: string): Promise<string | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (process.env.SEGMENT_AI_ENABLED !== "true" || !apiKey) return null;
    try {
      const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 });
      const message = await client.messages.create({
        model: COMPILE_MODEL,
        max_tokens: 512,
        system: buildCompileSystemPrompt(),
        messages: [{ role: "user", content: intent }],
      });
      const text = message.content.find((b) => b.type === "text")?.text?.trim();
      return text ? stripCodeFence(text) : null;
    } catch (error) {
      this.logger.warn("audience", "custom-query predicate compile failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

function buildCompileSystemPrompt(): string {
  return [
    "You translate an organiser's plain-English audience intent into ONE PostgreSQL boolean",
    "predicate (a WHERE-clause fragment) over this exact view:",
    "",
    "audience.contacts_safe columns:",
    ...CONTACTS_SAFE_COLUMNS.map((c) => `  - ${c}`),
    "",
    "Column notes: has_email/has_phone are booleans; email_domain is the lowercased domain part;",
    "created_at is a timestamp; state is an AU state code (NSW, VIC, QLD, SA, WA, TAS, NT, ACT);",
    "postcode/locality are text; turf_id is an opaque id.",
    "",
    "Rules:",
    "- Output ONLY the predicate — no SELECT, no FROM, no semicolon, no explanation, no code fence.",
    "- Never reference tenant_id (the system filters it).",
    "- Only these functions: now(), current_date, lower(), upper(), length(), date_trunc(), coalesce().",
    "- No subqueries. No comments.",
    "- If the intent cannot be expressed with these columns, output exactly: UNSUPPORTED",
  ].join("\n");
}

function stripCodeFence(text: string): string {
  return text
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/, "")
    .trim();
}
