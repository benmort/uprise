/**
 * Pure half of the send-again cooldown (the React wrapper is `useResendCooldown`).
 *
 * Split out so it can be tested the way this package tests everything else — as functions, with no
 * DOM and no testing-library dependency.
 */

/** Seconds a cooldown starts at, clamped to something sane if a caller passes nonsense. */
export function cooldownSeconds(requested: number): number {
  if (!Number.isFinite(requested)) return 30;
  return Math.min(Math.max(0, Math.trunc(requested)), 600);
}

/**
 * What the button should say. While waiting it counts down; otherwise it shows the idle label.
 *
 * The countdown replaces the label rather than sitting beside it, so the control always states
 * its own availability — a greyed-out "Resend" tells you that you cannot, but not when you can.
 */
export function cooldownLabel(remaining: number, idle = "Resend"): string {
  return remaining > 0 ? `Resend in ${remaining}s` : idle;
}
