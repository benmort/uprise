// Script talk-track resolver. A script is an opening line (a step with no outcomeKey)
// plus outcome-keyed branch steps ("if they say X, say this"). The door + SMS runtimes
// use this to show the canvasser what to say — the opener up front, then the branch that
// matches the disposition/answer. Pure + shared so both channels read scripts identically.

export type ScriptStepLike = {
  bodyText: string;
  outcomeKey?: string | null;
  orderIndex?: number | null;
};

const byOrder = (a: ScriptStepLike, b: ScriptStepLike) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0);

/** The opening line — the first step with no outcome key (falls back to the first step). */
export function openerStep(steps: ScriptStepLike[]): ScriptStepLike | null {
  const sorted = [...steps].sort(byOrder);
  return sorted.find((s) => !s.outcomeKey) ?? sorted[0] ?? null;
}

/** Every outcome-keyed branch, in order — the "if they say…" talk-tracks. */
export function branchSteps(steps: ScriptStepLike[]): ScriptStepLike[] {
  return [...steps].filter((s) => !!s.outcomeKey).sort(byOrder);
}

/** The branch talk-track for a given disposition/outcome code, if the script has one. */
export function branchFor(steps: ScriptStepLike[], outcomeKey: string | null | undefined): ScriptStepLike | null {
  if (!outcomeKey) return null;
  return branchSteps(steps).find((s) => s.outcomeKey === outcomeKey) ?? null;
}
