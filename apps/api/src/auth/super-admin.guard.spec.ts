import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SuperAdminGuard } from "./super-admin.guard";

describe("SuperAdminGuard", () => {
  function guardFor(required: boolean | undefined, user: unknown) {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(required as never);
    const guard = new SuperAdminGuard(reflector);
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
    return { guard, context };
  }

  it("allows when @SuperAdmin() is not present (allow-by-default)", () => {
    const { guard, context } = guardFor(undefined, undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows a super-admin", () => {
    const { guard, context } = guardFor(true, { isSuperAdmin: true });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("forbids a non-super-admin", () => {
    const { guard, context } = guardFor(true, { isSuperAdmin: false });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("forbids when there is no authenticated user", () => {
    const { guard, context } = guardFor(true, undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
