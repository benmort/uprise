/**
 * Wizard step-gating logic — pure + framework-free so it unit-tests without a DOM. The rule:
 * you may move freely through completed steps, but the first incomplete step is a wall you
 * can't jump past. Consumed by the <Wizard> component to cap how far the progress bar jumps.
 */

/**
 * The furthest step index (0-based) reachable given each step's completeness. Walks forward
 * while steps are complete and stops at the first incomplete one (which is itself reachable);
 * if every step is complete, the last step is reachable.
 */
export function furthestReachableStep(complete: readonly boolean[]): number {
  if (complete.length === 0) return 0;
  let i = 0;
  while (i < complete.length - 1 && complete[i]) i++;
  return i;
}
