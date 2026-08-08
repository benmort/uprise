/**
 * Role handling for the canvassing volunteer rosters.
 *
 * `listVolunteers` returns EVERY tenant member, owners included — they can be assigned turf like
 * anyone else. Both roster pages then collapsed any non-organiser role to "VOLUNTEER" for display
 * AND for the edit dialog's pre-filled select, and submitted that value unconditionally. So an
 * organiser opening the owner's row to correct a phone number posted `role: "VOLUNTEER"` and
 * demoted them — which bounces the owner to the field PWA and hides the organisation and channel
 * setup flows. There was no way back from that screen, because the endpoint's DTO only accepts
 * ORGANISER|VOLUNTEER.
 *
 * The server now refuses to touch an OWNER from this surface. These helpers stop the client
 * *asking*, and give the rosters one shared, tested definition instead of two hand-rolled copies.
 */

export type RosterRole = "OWNER" | "ORGANISER" | "VOLUNTEER";

/** The only roles this surface may assign. Owners are managed on Settings → Members. */
export const ROSTER_ASSIGNABLE_ROLES = ["ORGANISER", "VOLUNTEER"] as const;
export type RosterAssignableRole = (typeof ROSTER_ASSIGNABLE_ROLES)[number];

/**
 * The role to DISPLAY. Unknown roles read as VOLUNTEER (the least privilege), but OWNER is never
 * flattened — showing an owner as "Volunteer" is what made the demotion look like a no-op.
 */
export function displayRole(role: string | null | undefined): RosterRole {
  const value = (role ?? "").toUpperCase();
  if (value === "OWNER") return "OWNER";
  if (value === "ORGANISER") return "ORGANISER";
  return "VOLUNTEER";
}

/**
 * May this row be edited from the roster? Owners may not — except a super-admin, or the owner
 * acting on their own row. Mirrors the server check so the UI doesn't offer a doomed action.
 */
export function isEditableFromRoster(
  role: string | null | undefined,
  target: { id: string },
  actor: { id?: string | null; isSuperAdmin?: boolean } | null | undefined,
): boolean {
  if (displayRole(role) !== "OWNER") return true;
  if (actor?.isSuperAdmin) return true;
  return Boolean(actor?.id && actor.id === target.id);
}

/**
 * What to pre-select in the edit dialog. An owner's row has no assignable role, so it returns
 * undefined rather than a misleading default.
 */
export function initialAssignableRole(
  role: string | null | undefined,
): RosterAssignableRole | undefined {
  const shown = displayRole(role);
  if (shown === "OWNER") return undefined;
  return shown;
}

/**
 * The `role` to send on submit — `undefined` when it hasn't changed.
 *
 * This is the actual fix for the accidental demote: an untouched select can no longer rewrite a
 * role, whatever it happens to be showing. Saving a name or phone change now sends only that.
 */
export function roleChangeFor(
  current: string | null | undefined,
  selected: RosterAssignableRole | undefined,
): RosterAssignableRole | undefined {
  if (!selected) return undefined;
  const shown = displayRole(current);
  // An owner's role is never this surface's to send, whatever a stale select happens to hold.
  // The server refuses it too; this stops the client asking.
  if (shown === "OWNER") return undefined;
  return shown === selected ? undefined : selected;
}
