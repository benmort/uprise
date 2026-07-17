import Anthropic from "@anthropic-ai/sdk";
import { Injectable } from "@nestjs/common";
import {
  describeConditions,
  describeTree,
  matchKeywords,
  normaliseAiTree,
  type FilterNode,
  type ResidualClause,
} from "@uprise/segmentation";
import { DomainLogger } from "../common/logging/domain-logger.service";

/** Fast, cheap tier for the NL→filters translation. */
const SEGMENT_AI_MODEL = "claude-haiku-4-5";

/** The two-channel output the model fills via forced tool-use. */
interface BuildSegmentInput {
  filters?: Array<{ field?: string; op?: string; value?: unknown }>;
  customClauses?: Array<{ label?: string; intent?: string }>;
}

export interface GenerateFromPromptResult {
  name: string;
  tree: FilterNode;
  summary: string;
  /** Intent the closed vocabulary couldn't express — candidates for the custom-query lane. */
  customClauses: ResidualClause[];
}

/**
 * Plain-English authoring for the segment builder (ported from the slingshot
 * prototype's SegmentAuthoringService).
 *
 * `generateFromPrompt` translates a prompt into two channels — catalogue-
 * snappable `filters` and residual `customClauses` (intent the closed
 * vocabulary can't express) — then runs everything through the SAME
 * `normaliseAiTree` trust boundary, so unvalidated model output can never
 * escape into a stored tree.
 *
 * The engine is Claude (forced tool-use, {@link SEGMENT_AI_MODEL}) when
 * `SEGMENT_AI_ENABLED=true` and `ANTHROPIC_API_KEY` is set; otherwise — and on
 * any error — it falls back to the deterministic keyword matcher over the
 * catalogue, so the builder always works end-to-end.
 */
@Injectable()
export class SegmentAuthoringService {
  constructor(private readonly logger: DomainLogger) {}

  async generateFromPrompt(prompt: string): Promise<GenerateFromPromptResult> {
    const { loose, modelClauses } = await this.translate(prompt);
    const { tree, residual } = normaliseAiTree(loose);
    const summary = describeTree(tree);
    const name = deriveName(prompt);
    // Custom-query lane = the model's declared residual + anything the normaliser couldn't snap.
    const customClauses = dedupeClauses([...modelClauses, ...residual]);
    return { name, tree, summary, customClauses };
  }

  /** Produce a loose tree + residual clauses, via Claude when enabled, else the keyword matcher. */
  private async translate(
    prompt: string,
  ): Promise<{ loose: unknown; modelClauses: ResidualClause[] }> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (process.env.SEGMENT_AI_ENABLED !== "true" || !apiKey) {
      return { loose: matchKeywords(prompt), modelClauses: [] };
    }
    try {
      const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 });
      const message = await client.messages.create({
        model: SEGMENT_AI_MODEL,
        max_tokens: 1024,
        system: buildSystemPrompt(),
        tools: [
          {
            name: "build_segment",
            description:
              "Emit the audience filters (from the catalogue) plus any residual intent the catalogue cannot express.",
            input_schema: {
              type: "object" as const,
              properties: {
                filters: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field: { type: "string", description: "A catalogue condition type id" },
                      op: { type: "string" },
                      value: {},
                    },
                  },
                },
                customClauses: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      intent: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        ],
        tool_choice: { type: "tool", name: "build_segment" },
        messages: [{ role: "user", content: prompt }],
      });
      const toolUse = message.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      const input = (toolUse?.input ?? {}) as BuildSegmentInput;
      const modelClauses: ResidualClause[] = (input.customClauses ?? [])
        .filter((c) => c && (c.label || c.intent))
        .map((c) => ({
          label: String(c.label ?? c.intent ?? "").slice(0, 200),
          intent: String(c.intent ?? c.label ?? "").slice(0, 2000),
        }));
      return { loose: { match: "all", conditions: input.filters ?? [] }, modelClauses };
    } catch (error) {
      this.logger.warn("audience", "segment prompt translation failed — keyword fallback", {
        message: error instanceof Error ? error.message : String(error),
      });
      return { loose: matchKeywords(prompt), modelClauses: [] };
    }
  }
}

/** Catalogue-driven system prompt — the model only ever sees the real vocabulary. */
function buildSystemPrompt(): string {
  const sections = describeConditions("blast").sections;
  const lines: string[] = [
    "You translate an organiser's plain-English audience description into segment filters.",
    "Use ONLY these condition types (field = the type id):",
    "",
  ];
  for (const section of sections) {
    lines.push(`## ${section.group}`);
    for (const entry of section.entries) {
      if (entry.capability !== "now") continue;
      const ops = entry.operators.join("/") || "is";
      const options = entry.options?.length
        ? ` options: ${entry.options.map((o) => o.value).join(", ")}`
        : "";
      lines.push(`- ${entry.type} (${entry.dataType}; ops ${ops})${options} — ${entry.description}`);
    }
  }
  lines.push(
    "",
    "Rules:",
    "- Emit one filters[] entry per expressible condition: { field: <type id>, op, value }.",
    "- Date conditions: op 'within', value = number of days.",
    "- Negations: use op strings containing 'not' (e.g. 'not in').",
    "- Anything the catalogue cannot express goes in customClauses[] as { label, intent } — never invent field ids.",
    "- Prefer fewer, precise filters over many speculative ones.",
  );
  return lines.join("\n");
}

function deriveName(prompt: string): string {
  const cleaned = prompt.trim().replace(/\s+/g, " ");
  const name = cleaned.length > 60 ? `${cleaned.slice(0, 57)}…` : cleaned;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function dedupeClauses(clauses: ResidualClause[]): ResidualClause[] {
  const seen = new Set<string>();
  const out: ResidualClause[] = [];
  for (const clause of clauses) {
    const key = clause.intent.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clause);
  }
  return out;
}
