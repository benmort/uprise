/**
 * The deterministic keyword fallback (ported from the slingshot prototype) —
 * when the AI is disabled or errors, translate a plain-English prompt into a
 * loose tree by matching catalogue keywords, so the prompt-to-segment flow
 * always works end-to-end. The output goes through the SAME `normaliseAiTree`
 * trust boundary as model output.
 */
import { UPRISE_CATALOGUE } from "../catalogue/uprise-catalogue";

interface LooseCondition {
  field: string;
  op?: string;
  value?: unknown;
}

/** Extract a rolling day-window from the prompt ("30 days", "3 months", "this week"). */
const extractWindowDays = (prompt: string): number | null => {
  const daysMatch = /(\d+)\s*day/i.exec(prompt);
  if (daysMatch) return Number(daysMatch[1]);
  const weeksMatch = /(\d+)\s*week/i.exec(prompt);
  if (weeksMatch) return Number(weeksMatch[1]) * 7;
  const monthsMatch = /(\d+)\s*month/i.exec(prompt);
  if (monthsMatch) return Number(monthsMatch[1]) * 30;
  if (/this\s+week/i.test(prompt)) return 7;
  if (/this\s+month|active this month/i.test(prompt)) return 30;
  if (/this\s+year/i.test(prompt)) return 365;
  return null;
};

/**
 * Match catalogue keywords in a prompt and build loose conditions for
 * `normaliseAiTree`. Static option values/labels found in the prompt become the
 * condition's values; date entries get the extracted window (default 90 days).
 */
export const matchKeywords = (prompt: string): { match: "all"; conditions: LooseCondition[] } => {
  const lower = prompt.toLowerCase();
  const negated = (keyword: string): boolean =>
    new RegExp(`(not|n't|without|never|haven't|hasn't)[^.]{0,24}\\b${keyword}`, "i").test(lower);

  const conditions: LooseCondition[] = [];
  const claimed = new Set<string>();

  for (const entry of UPRISE_CATALOGUE) {
    if (entry.layer !== "L1" || entry.capability !== "now") continue;
    const keyword = entry.keywords.find((k) => lower.includes(k.toLowerCase()));
    if (!keyword || claimed.has(entry.type)) continue;

    if (entry.dataType === "enum" && entry.options?.length) {
      const values = entry.options
        .filter(
          (o) =>
            lower.includes(o.value.toLowerCase()) || lower.includes(o.label.toLowerCase()),
        )
        .map((o) => o.value);
      if (values.length === 0) continue;
      claimed.add(entry.type);
      conditions.push({
        field: entry.type,
        op: negated(keyword) ? "not in" : "in",
        value: values,
      });
      continue;
    }

    if (entry.dataType === "date") {
      const days = extractWindowDays(prompt) ?? 90;
      claimed.add(entry.type);
      conditions.push({ field: entry.type, op: "within", value: days });
      continue;
    }

    if (entry.dataType === "bool") {
      claimed.add(entry.type);
      conditions.push({ field: entry.type, op: negated(keyword) ? "is not" : "is", value: true });
      continue;
    }

    if (entry.dataType === "bespoke" && entry.operators.includes("is")) {
      claimed.add(entry.type);
      conditions.push({ field: entry.type, op: negated(keyword) ? "is not" : "is" });
    }
  }

  return { match: "all", conditions };
};
