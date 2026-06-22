import { AbilityBuilder, createMongoAbility, type MongoAbility } from "@casl/ability";
import type { Action, AuthenticatedActor, PermissionRule, Resource } from "./types";
import { YARNS_RESOURCES } from "./types";
import { ROLE_PERMISSIONS, isKnownRole } from "./roles";

export type AppAbility = MongoAbility<[Action, Resource]>;

/** `<domain>` → concrete `<domain>.<entity>` resources, to expand `.all` wildcards. */
const DOMAIN_RESOURCES: Record<string, string[]> = (() => {
  const byDomain: Record<string, string[]> = {};
  for (const resource of YARNS_RESOURCES) {
    if (resource === "all") continue;
    const dot = resource.indexOf(".");
    if (dot < 0) continue;
    const domain = resource.slice(0, dot);
    const entity = resource.slice(dot + 1);
    if (entity === "all") continue;
    (byDomain[domain] ??= []).push(resource);
  }
  return byDomain;
})();

function expandRule(rule: PermissionRule): PermissionRule[] {
  if (rule.resource === "all") return [rule];
  if (!rule.resource.endsWith(".all")) return [rule];
  const domain = rule.resource.slice(0, -".all".length);
  const concretes = DOMAIN_RESOURCES[domain];
  if (!concretes || concretes.length === 0) return [rule];
  return concretes.map((resource) => ({
    action: rule.action,
    resource,
    inverted: rule.inverted,
    conditions: rule.conditions,
  }));
}

/**
 * Build a CASL ability for an actor.
 *   1. Super-admin bypass: actorPermissions containing manage:all allows everything.
 *   2. Resolve roles → positive rule set (with `.all` expansion).
 *   3. Apply actorPermissions on top — supports `inverted: true` to revoke.
 */
export function defineAbilityFor(actor: AuthenticatedActor): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  const hasSuperAdmin = (actor.actorPermissions ?? []).some(
    (r) => r.action === "manage" && r.resource === "all" && !r.inverted,
  );
  if (hasSuperAdmin) {
    can("manage", "all");
    return build();
  }

  for (const rule of resolveRolePermissions(actor.roles).flatMap(expandRule)) {
    can(rule.action, rule.resource, rule.conditions as never);
  }

  for (const rule of (actor.actorPermissions ?? []).flatMap(expandRule)) {
    if (rule.inverted) cannot(rule.action, rule.resource, rule.conditions as never);
    else can(rule.action, rule.resource, rule.conditions as never);
  }

  return build();
}

/** Resolve role identifiers to their flattened rules; unknown roles are skipped. */
export function resolveRolePermissions(
  roles: ReadonlyArray<string>,
): ReadonlyArray<PermissionRule> {
  const out: PermissionRule[] = [];
  for (const role of roles) {
    if (!isKnownRole(role)) continue;
    out.push(...ROLE_PERMISSIONS[role]);
  }
  return out;
}
