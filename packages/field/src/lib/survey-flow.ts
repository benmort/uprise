// Shared survey branch resolver — the SINGLE source of truth for "what question
// comes next", consumed by both the door runner and the SMS console so branching
// can never diverge between channels. Pure + edge-case-safe (dangling edges fall
// through; cycles are the caller's guard).

export type FlowOption = {
  value: string;
  nextQuestionKey?: string | null;
  isTerminal?: boolean | null;
};

export type FlowQuestion = {
  key: string;
  defaultNextQuestionKey?: string | null;
  options?: FlowOption[] | null;
};

export type FlowSurvey = {
  entryQuestionKey?: string | null;
  questions: FlowQuestion[];
};

/** The first question to ask — the configured entry, else the first by order. */
export function entryQuestionKey(survey: FlowSurvey): string | null {
  const entry = survey.entryQuestionKey;
  if (entry && survey.questions.some((q) => q.key === entry)) return entry;
  return survey.questions[0]?.key ?? null;
}

/**
 * The next question key after answering `question` with `chosen` (null for
 * text/scale/skip). Precedence: a terminal option ends the survey; an option's
 * explicit edge; the question's default edge; then fall through to the next
 * question by array order. A dangling edge (target not present) falls through
 * rather than dead-ending. Returns null to end the survey.
 */
export function resolveNextQuestionKey(
  question: FlowQuestion,
  chosen: FlowOption | null | undefined,
  questions: FlowQuestion[],
): string | null {
  const has = (k?: string | null): k is string => !!k && questions.some((q) => q.key === k);
  if (chosen) {
    if (chosen.isTerminal) return null;
    if (has(chosen.nextQuestionKey)) return chosen.nextQuestionKey;
  }
  if (has(question.defaultNextQuestionKey)) return question.defaultNextQuestionKey;
  const idx = questions.findIndex((q) => q.key === question.key);
  if (idx < 0) return null; // question not in the set — end rather than jumping to the first
  return questions[idx + 1]?.key ?? null;
}
