import type { TurfContact, RouteLeg } from "@/lib/api";

/**
 * Turn the optimised route (a contact-id order + per-leg walking metrics) into a street-grouped
 * walk list: consecutive stops on the same street collapse into one group, in walking order, with
 * the leg that leaves each group (its last stop → the next group's first stop) attached. This is
 * the classic paper walk-list shape — a street header with its door numbers beneath — and the
 * "↓ 120 m · 2 min" connector sits between groups.
 */

export type WalkStop = TurfContact & { seq: number };

export type WalkGroup = {
  /** Grouping key (lowercased street, else locality) — unique per run. */
  key: string;
  street: string | null;
  locality: string | null;
  stops: WalkStop[];
  /** Walking leg from this group's last stop to the next group's first stop; null on the last group. */
  legToNext: RouteLeg | null;
};

/** The best single-line label for a stop, from richest to poorest data. */
export function stopLabel(c: TurfContact): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
  if (name) return name;
  return c.address || "Unknown address";
}

/** Just the street-number portion for a grouped row ("96" from "96 Smith Street, …"). */
export function doorNumber(c: TurfContact): string {
  const m = (c.address ?? "").match(/^\s*(\d+[a-z]?(?:[-/]\d+[a-z]?)?)/i);
  return m ? m[1] : (c.address ?? "").split(/[·,]/)[0].trim() || "?";
}

/**
 * Order + group the turf's contacts. `ordered` is the route endpoint's contact-id sequence
 * (unlocated stops sorted to the end); `legs` are per-consecutive-pair walking metrics keyed by
 * `fromId`. Contacts not in `ordered` (shouldn't happen) are appended so none are dropped.
 */
export function buildWalkGroups(
  contacts: TurfContact[],
  ordered: string[],
  legs: RouteLeg[],
): { groups: WalkGroup[]; stops: WalkStop[] } {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const seq = ordered.filter((id) => byId.has(id));
  for (const c of contacts) if (!seq.includes(c.id)) seq.push(c.id); // safety net: never drop a stop
  const stops: WalkStop[] = seq.map((id, i) => ({ ...(byId.get(id) as TurfContact), seq: i + 1 }));

  const legByFrom = new Map(legs.map((l) => [l.fromId, l]));

  const groups: WalkGroup[] = [];
  for (const s of stops) {
    const key = (s.street ?? s.locality ?? "").trim().toLowerCase();
    const last = groups[groups.length - 1];
    if (last && key !== "" && last.key === key) {
      last.stops.push(s);
    } else {
      groups.push({ key: key || `stop-${s.seq}`, street: s.street, locality: s.locality, stops: [s], legToNext: null });
    }
  }
  // The leg leaving a group starts at its last stop (→ the first stop of the next group).
  for (const g of groups) {
    const lastId = g.stops[g.stops.length - 1].id;
    g.legToNext = legByFrom.get(lastId) ?? null;
  }
  return { groups, stops };
}
