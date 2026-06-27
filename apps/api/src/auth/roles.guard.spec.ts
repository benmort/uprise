import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AppUserRole } from "@uprise/db";
import { RolesGuard } from "./roles.guard";

describe("RolesGuard", () => {
  function guardFor(required: AppUserRole[] | undefined, user: unknown) {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(required as never);
    const guard = new RolesGuard(reflector);
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
    return { guard, context };
  }

  it("allows when no roles are required", () => {
    const { guard, context } = guardFor(undefined, undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows when the user's role is in the required set", () => {
    const { guard, context } = guardFor([AppUserRole.ORGANISER], { role: AppUserRole.ORGANISER });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("forbids when the user's role is not allowed", () => {
    const { guard, context } = guardFor([AppUserRole.ORGANISER], { role: AppUserRole.VOLUNTEER });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("forbids when there is no authenticated user", () => {
    const { guard, context } = guardFor([AppUserRole.VOLUNTEER], undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
