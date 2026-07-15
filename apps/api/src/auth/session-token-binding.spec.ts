import { UnauthorizedException } from "@nestjs/common";
import { AuthFlowsController } from "./auth-flows.controller";
import { IamController } from "./iam.controller";

/**
 * Session-mutating endpoints must target the session the guard actually authenticated
 * (req.user.sessionToken), not the first auth_token cookie — a stale duplicate cookie
 * would otherwise be written while /auth/check keeps reading the real session (the tenant
 * switch never sticks). These cover that binding for select-tenant + the "current session"
 * endpoints on IamController.
 */
describe("session-token binding (resolved session vs first cookie)", () => {
  const config = { get: jest.fn().mockReturnValue("") } as any;

  describe("AuthFlowsController.selectTenant", () => {
    const makeController = () => {
      const flows = { selectTenant: jest.fn().mockResolvedValue({ ok: true }) } as any;
      return { flows, controller: new AuthFlowsController(flows, {} as any, config) };
    };

    it("pins the tenant on the guard-resolved session token, not the first cookie", async () => {
      const { flows, controller } = makeController();
      const req: any = {
        user: { id: "u1", sessionToken: "resolved_tok" },
        headers: { cookie: "auth_token=stale_first; auth_token=resolved_tok" },
      };
      await controller.selectTenant({ tenantId: "t2" } as any, req);
      expect(flows.selectTenant).toHaveBeenCalledWith("u1", "resolved_tok", "t2");
    });

    it("falls back to the cookie token when the guard recorded none", async () => {
      const { flows, controller } = makeController();
      const req: any = { user: { id: "u1" }, headers: { cookie: "auth_token=only_cookie" } };
      await controller.selectTenant({ tenantId: "t2" } as any, req);
      expect(flows.selectTenant).toHaveBeenCalledWith("u1", "only_cookie", "t2");
    });

    it("rejects when unauthenticated (no user + no token)", async () => {
      const { controller } = makeController();
      const req: any = { headers: {} };
      await expect(controller.selectTenant({ tenantId: "t2" } as any, req)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("IamController current-session endpoints", () => {
    const makeController = () => {
      const sessions = {
        revoke: jest.fn().mockResolvedValue(undefined),
        listForUser: jest.fn().mockResolvedValue([]),
        revokeOthers: jest.fn().mockResolvedValue(undefined),
      } as any;
      return { sessions, controller: new IamController(sessions, {} as any, config) };
    };
    const req = () => ({
      user: { id: "u1", sessionToken: "resolved_tok" },
      headers: { cookie: "auth_token=stale_first; auth_token=resolved_tok" },
    });

    it("logout revokes the resolved session", async () => {
      const { sessions, controller } = makeController();
      const res: any = { clearCookie: jest.fn() };
      await controller.logout(req() as any, res);
      expect(sessions.revoke).toHaveBeenCalledWith("resolved_tok");
    });

    it("listSessions marks the resolved session as current", async () => {
      const { sessions, controller } = makeController();
      await controller.listSessions(req() as any);
      expect(sessions.listForUser).toHaveBeenCalledWith("u1", "resolved_tok");
    });

    it("revoke-others keeps the resolved session", async () => {
      const { sessions, controller } = makeController();
      await controller.revokeOtherSessions(req() as any);
      expect(sessions.revokeOthers).toHaveBeenCalledWith("u1", "resolved_tok");
    });
  });
});
