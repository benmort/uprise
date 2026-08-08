/**
 * Role predicates for the session principal.
 *
 * `principal.role` is the membership role VERBATIM — the session service passes it straight
 * through, and there is no OWNER→ORGANISER coercion anywhere in the API (a comment in
 * settings/team/page.tsx claims otherwise; it is wrong). So an owner is `"OWNER"`, never
 * `"ORGANISER"`, and any check written as `role === "ORGANISER"` silently excludes the one person
 * who owns the workspace.
 *
 * That is what hid the pending join-request badge from owners: the count that drives both the
 * sidebar and collapsed-nav badges was gated on `role !== "ORGANISER"`, so it stayed 0 for every
 * owner — and it is the only ambient signal that someone is waiting to be let in. The API is more
 * permissive than the UI here: it gates on the `member.manage` ability, which owners hold.
 *
 * Five call sites already spell out `=== "OWNER" || === "ORGANISER"` correctly; this exists so the
 * sixth cannot get it wrong.
 */

export type PrincipalRole = "OWNER" | "ORGANISER" | "VOLUNTEER";

export type RolePrincipal = {
  role?: string | null;
  isSuperAdmin?: boolean;
} | null | undefined;

/** Owner or organiser — the roles that administer a workspace. Super-admins always qualify. */
export function canManageWorkspace(principal: RolePrincipal): boolean {
  if (principal?.isSuperAdmin) return true;
  const role = (principal?.role ?? "").toUpperCase();
  return role === "OWNER" || role === "ORGANISER";
}

/** Strictly the workspace owner (billing, ownership transfer, destructive settings). */
export function isOwner(principal: RolePrincipal): boolean {
  return (principal?.role ?? "").toUpperCase() === "OWNER";
}

/** A field volunteer — everything else is an administering role. */
export function isVolunteer(principal: RolePrincipal): boolean {
  if (principal?.isSuperAdmin) return false;
  return (principal?.role ?? "").toUpperCase() === "VOLUNTEER";
}
