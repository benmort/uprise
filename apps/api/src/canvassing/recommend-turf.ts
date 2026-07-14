// Ranks volunteer self-serve turf by the advisory canvass preferences captured at
// onboarding (walkingCapability + sessionLength, stored on TenantMember.canvassPrefs).
// Kept pure + dependency-free so it unit-tests without a DB and typechecks in the worker
// (which compiles this transitively but doesn't depend on @uprise/contracts) — the
// canvassing service composes it over its unassigned-turf query for "Recommended turf".
// The two unions mirror @uprise/contracts WALKING_CAPABILITIES / SESSION_LENGTHS.
type WalkingCapability = "short" | "moderate" | "long" | "minimal";
type SessionLength = "short" | "standard" | "long" | "flexible";

export type CanvassPrefs = {
  walkingCapability?: WalkingCapability | null;
  sessionLength?: SessionLength | null;
};

// Session length sets the base number of doors a volunteer wants to work in a shift;
// walking capability scales it. Both advisory — "flexible" session length (and no prefs
// at all) means no target, so we fall back to smallest-first.
const SESSION_BASE: Record<SessionLength, number | null> = {
  short: 20,
  standard: 40,
  long: 70,
  flexible: null,
};
const WALK_MULTIPLIER: Record<WalkingCapability, number> = {
  minimal: 0.6,
  short: 0.8,
  moderate: 1,
  long: 1.3,
};

/** The door count a volunteer's prefs point at, or null when we can't infer one. */
export function preferredDoorLoad(prefs: CanvassPrefs | null | undefined): number | null {
  const base = prefs?.sessionLength ? SESSION_BASE[prefs.sessionLength] : null;
  if (base == null) return null;
  const mult = prefs?.walkingCapability ? WALK_MULTIPLIER[prefs.walkingCapability] : 1;
  return Math.round(base * mult);
}

/** Order turf best-fit-first for the volunteer: closest to their preferred door load when
 *  we have one, otherwise smallest (most approachable) first. Stable + non-mutating. */
export function rankTurfsByPrefs<T extends { contactCount: number }>(
  turfs: T[],
  prefs: CanvassPrefs | null | undefined,
): T[] {
  const target = preferredDoorLoad(prefs);
  const score = (t: T) => (target == null ? t.contactCount : Math.abs(t.contactCount - target));
  return turfs
    .map((t, i) => ({ t, i, s: score(t) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.t);
}
