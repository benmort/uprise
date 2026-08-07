"use client";

import { useCallback, useEffect, useState } from "react";
import { cooldownLabel, cooldownSeconds } from "../lib/resend-cooldown";

/**
 * A send-again cooldown: seconds remaining, and a `start()` to reset it.
 *
 * Every surface that sends an SMS code needs this, and every one of them is a button a frustrated
 * person will press repeatedly. Each press costs a real message — money, and a carrier's patience
 * with the sending number — so the control has to say "not yet" rather than quietly fire again.
 *
 * The auth app hand-rolled the same 30-second countdown on four screens (two-factor, account
 * recovery, magic link, volunteer code). This is that pattern, once, so admin surfaces get the
 * behaviour organisers already recognise from signing in.
 *
 * Client-only (it holds a timer). It is a courtesy, not a control: the server is what actually
 * enforces a rate limit, and this only stops the honest double-press.
 */
export function useResendCooldown(seconds = 30): {
  /** Seconds left; 0 when sending is allowed. */
  remaining: number;
  /** True while the cooldown is running — bind straight to `disabled`. */
  waiting: boolean;
  /** "Resend in 12s" while waiting, or the idle label. */
  label: (idle?: string) => string;
  /** Call after a successful send. */
  start: () => void;
  /** Call when a send fails, so a failure does not cost the user a wait. */
  reset: () => void;
} {
  const total = cooldownSeconds(seconds);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((n) => n - 1), 1_000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const start = useCallback(() => setRemaining(total), [total]);
  const reset = useCallback(() => setRemaining(0), []);
  const label = useCallback((idle = "Resend") => cooldownLabel(remaining, idle), [remaining]);

  return { remaining, waiting: remaining > 0, label, start, reset };
}
