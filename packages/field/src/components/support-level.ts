// Canonical SupportLevel lives in the API contracts (api/contacts) so the type is
// defined once; this UI module adds the colour/order metadata over it.
export type { SupportLevel } from "../api/contacts";
import type { SupportLevel } from "../api/contacts";

export const SUPPORT_ORDER: SupportLevel[] = [
  "STRONG_SUPPORT",
  "LEAN_SUPPORT",
  "UNDECIDED",
  "LEAN_OPPOSE",
  "STRONG_OPPOSE",
];

export const SUPPORT_META: Record<
  SupportLevel,
  { label: string; short: string; varName: string }
> = {
  STRONG_SUPPORT: { label: "Strong support", short: "Strong", varName: "--support-strong" },
  LEAN_SUPPORT: { label: "Lean support", short: "Lean", varName: "--support-lean" },
  UNDECIDED: { label: "Undecided", short: "Undecided", varName: "--support-undecided" },
  LEAN_OPPOSE: { label: "Lean oppose", short: "Lean opp.", varName: "--support-lean-oppose" },
  STRONG_OPPOSE: { label: "Strong oppose", short: "Strong opp.", varName: "--support-strong-oppose" },
};

export function supportColor(level: SupportLevel): string {
  return `hsl(var(${SUPPORT_META[level].varName}))`;
}
