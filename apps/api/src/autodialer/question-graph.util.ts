import { DialerAnswerType } from "@uprise/db";

/**
 * The typed question-graph layer — validation and the authoring-format expander.
 *
 * A graph is an ordered list of questions; each answer's `nextKey` points at
 * another question's key, the literal "outro" (play the campaign outro and end)
 * or null (hang up). Transfer is an ANSWER TYPE (REDIRECT with `transfer`),
 * never a next target. The wire shape here matches the DTO/api-client contract;
 * persistence into DialerQuestion/DialerAnswer rows happens in the service.
 */

/** Terminal sentinel: play the campaign outro, then end the call. */
export const NEXT_OUTRO = "outro" as const;

export type QuestionGraphAnswer = {
  digit: string;
  value: string;
  /** Another question's key | "outro" | null (hang up). */
  nextKey: string | null;
  type?: DialerAnswerType | null;
  /** SMS body for type SMS. */
  content?: string | null;
  transfer?: boolean;
  dispositionCode?: string | null;
  supportLevel?: string | null;
};

export type QuestionGraphNode = {
  key: string;
  /** The spoken text — also the <Say> fallback when no audio prompt is set. */
  name: string;
  type?: "STANDARD" | "SWITCHBOARD";
  /** Prompt shape: fileId string or { [lang]: fileId }. */
  audioPrompt?: unknown;
  answers: QuestionGraphAnswer[];
};

export type QuestionGraphIssue = {
  severity: "error" | "warning";
  code:
    | "EMPTY_GRAPH"
    | "DUPLICATE_KEY"
    | "MISSING_NAME"
    | "DUPLICATE_DIGIT"
    | "INVALID_DIGIT"
    | "DANGLING_NEXT"
    | "UNREACHABLE"
    | "NO_ANSWERS"
    | "CYCLE";
  questionKey?: string;
  detail: string;
};

const VALID_DIGITS = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

/**
 * Structural validation. Errors block activation; cycles are warnings only —
 * some IVRs deliberately loop (e.g. "press 9 to hear that again").
 */
export function validateQuestionGraph(questions: QuestionGraphNode[]): QuestionGraphIssue[] {
  const issues: QuestionGraphIssue[] = [];
  if (questions.length === 0) {
    return [{ severity: "error", code: "EMPTY_GRAPH", detail: "A survey needs at least one question." }];
  }

  const keys = new Set<string>();
  for (const q of questions) {
    if (keys.has(q.key)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_KEY",
        questionKey: q.key,
        detail: `Question key "${q.key}" is used more than once.`,
      });
    }
    keys.add(q.key);

    if (!q.name?.trim()) {
      issues.push({
        severity: "error",
        code: "MISSING_NAME",
        questionKey: q.key,
        detail: `Question "${q.key}" has no spoken text.`,
      });
    }

    // SWITCHBOARD questions route without gathering, so an empty answer set is
    // legal for them and only them.
    if (q.answers.length === 0 && q.type !== "SWITCHBOARD") {
      issues.push({
        severity: "error",
        code: "NO_ANSWERS",
        questionKey: q.key,
        detail: `Question "${q.key}" has no answers to gather.`,
      });
    }

    const digits = new Set<string>();
    for (const a of q.answers) {
      if (!VALID_DIGITS.has(a.digit)) {
        issues.push({
          severity: "error",
          code: "INVALID_DIGIT",
          questionKey: q.key,
          detail: `Answer digit "${a.digit}" on "${q.key}" is not 0–9 (the * key is reserved for opt-out).`,
        });
      }
      if (digits.has(a.digit)) {
        issues.push({
          severity: "error",
          code: "DUPLICATE_DIGIT",
          questionKey: q.key,
          detail: `Digit ${a.digit} is used twice on question "${q.key}".`,
        });
      }
      digits.add(a.digit);
    }
  }

  // Dangling nextKey — must be a known question key or the outro sentinel.
  for (const q of questions) {
    for (const a of q.answers) {
      if (a.nextKey !== null && a.nextKey !== NEXT_OUTRO && !keys.has(a.nextKey)) {
        issues.push({
          severity: "error",
          code: "DANGLING_NEXT",
          questionKey: q.key,
          detail: `Answer ${a.digit} on "${q.key}" points at "${a.nextKey}", which does not exist.`,
        });
      }
    }
  }

  // Reachability from the first question (dial order).
  const byKey = new Map(questions.map((q) => [q.key, q]));
  const reachable = new Set<string>();
  const stack = [questions[0].key];
  while (stack.length) {
    const key = stack.pop()!;
    if (reachable.has(key)) continue;
    reachable.add(key);
    for (const a of byKey.get(key)?.answers ?? []) {
      if (a.nextKey && a.nextKey !== NEXT_OUTRO && byKey.has(a.nextKey)) stack.push(a.nextKey);
    }
  }
  for (const q of questions) {
    if (!reachable.has(q.key)) {
      issues.push({
        severity: "warning",
        code: "UNREACHABLE",
        questionKey: q.key,
        detail: `Question "${q.key}" is never reached from "${questions[0].key}".`,
      });
    }
  }

  // Cycle detection (DFS colouring) — warnings, not errors.
  const state = new Map<string, "visiting" | "done">();
  const visit = (key: string): boolean => {
    if (state.get(key) === "visiting") return true;
    if (state.get(key) === "done") return false;
    state.set(key, "visiting");
    for (const a of byKey.get(key)?.answers ?? []) {
      if (a.nextKey && a.nextKey !== NEXT_OUTRO && byKey.has(a.nextKey) && visit(a.nextKey)) {
        state.set(key, "done");
        return true;
      }
    }
    state.set(key, "done");
    return false;
  };
  if (visit(questions[0].key)) {
    issues.push({
      severity: "warning",
      code: "CYCLE",
      detail: "The graph contains a loop — deliberate repeats are fine, but check it is escapable.",
    });
  }

  return issues;
}

/** True when the graph has no blocking (error-severity) issues. */
export function questionGraphActivatable(questions: QuestionGraphNode[]): boolean {
  return validateQuestionGraph(questions).every((i) => i.severity !== "error");
}

/** The simplified authoring shape — a linear poll with no branch work. */
export type AuthoringQuestion = {
  key?: string;
  question: string;
  options: string[];
  audioPrompt?: unknown;
};

/**
 * Port of the source `transformSurveyQuestions` semantics: each option becomes
 * answer digit 1..n, every answer's nextKey defaults to the FOLLOWING question,
 * and the last question's answers default to "outro". Keys are generated
 * q1..qn when not supplied.
 */
export function expandAuthoringFormat(authoring: AuthoringQuestion[]): QuestionGraphNode[] {
  return authoring.map((q, index) => {
    const key = q.key?.trim() || `q${index + 1}`;
    const nextKey =
      index + 1 < authoring.length ? authoring[index + 1].key?.trim() || `q${index + 2}` : NEXT_OUTRO;
    return {
      key,
      name: q.question,
      type: "STANDARD" as const,
      ...(q.audioPrompt !== undefined ? { audioPrompt: q.audioPrompt } : {}),
      answers: q.options.map((value, optionIndex) => ({
        digit: String(optionIndex + 1),
        value,
        nextKey,
      })),
    };
  });
}
