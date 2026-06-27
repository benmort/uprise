import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AbilityGuard } from "./ability.guard";
import type { RequiredPermission } from "./require-permission.decorator";

function guardWith(required: RequiredPermission | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
  return new AbilityGuard(reflector);
}

function ctx(user: unknown): ExecutionContext {
  return {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("AbilityGuard", () => {
  it("allows routes with no @RequirePermission", () => {
    expect(guardWith(undefined).canActivate(ctx(undefined))).toBe(true);
  });

  it("allows an organiser to manage audiences", () => {
    const g = guardWith({ action: "manage", resource: "audience.audience" });
    expect(g.canActivate(ctx({ id: "u1", roles: ["organiser"] }))).toBe(true);
  });

  it("denies a canvasser from managing audiences", () => {
    const g = guardWith({ action: "manage", resource: "audience.audience" });
    expect(() => g.canActivate(ctx({ id: "u1", roles: ["volunteer"] }))).toThrow(ForbiddenException);
  });

  it("allows a canvasser to manage doorknocks", () => {
    const g = guardWith({ action: "manage", resource: "canvass.doorknock" });
    expect(g.canActivate(ctx({ id: "u1", roles: ["volunteer"] }))).toBe(true);
  });

  it("super-admin (env break-glass) passes any permission", () => {
    const g = guardWith({ action: "manage", resource: "payment.all" });
    expect(g.canActivate(ctx({ id: "env-admin", roles: ["super-admin"] }))).toBe(true);
  });

  it("denies when a gated route has no authenticated user", () => {
    const g = guardWith({ action: "read", resource: "audience.audience" });
    expect(() => g.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
