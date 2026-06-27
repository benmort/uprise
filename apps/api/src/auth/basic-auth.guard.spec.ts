import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { BasicAuthGuard } from "./basic-auth.guard";
import { createStreamToken } from "./stream-token";

function executionContextWithRequest(request: Partial<Request>): ExecutionContext {
  const normalizedRequest: Partial<Request> = { ...request };
  const path = normalizedRequest.path;
  if (!normalizedRequest.url && typeof path === "string") {
    normalizedRequest.url = path;
  }
  if (!normalizedRequest.originalUrl && typeof path === "string") {
    normalizedRequest.originalUrl = path;
  }

  return {
    switchToHttp: () => ({
      getRequest: () => normalizedRequest,
    }),
  } as unknown as ExecutionContext;
}

describe("BasicAuthGuard", () => {
  function createGuard(options?: {
    username?: string;
    password?: string;
    cronSecret?: string;
    streamTokenSecret?: string;
    integrationSecret?: string;
  }) {
    const {
      username = "admin",
      password = "secret",
      cronSecret = "cron-secret",
      streamTokenSecret = "stream-secret",
      integrationSecret = "integration-secret",
    } = options || {};
    const config = {
      get: (key: string) => {
        if (key === "BASIC_AUTH_USERNAME") return username;
        if (key === "BASIC_AUTH_PASSWORD") return password;
        if (key === "CRON_SECRET") return cronSecret;
        if (key === "STREAM_TOKEN_SECRET") return streamTokenSecret;
        if (key === "INTEGRATION_CREDENTIAL_SECRET") return integrationSecret;
        return undefined;
      },
    } as ConfigService;
    return new BasicAuthGuard(config);
  }

  it("allows inbound webhook without auth on prefixed path", () => {
    const guard = createGuard();
    const context = executionContextWithRequest({
      path: "/api/v1/inbound-text-message-hook",
      headers: {},
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows OPTIONS preflight requests without auth", () => {
    const guard = createGuard();
    const context = executionContextWithRequest({
      method: "OPTIONS",
      path: "/api/v1/auth/check",
      headers: {
        origin: "https://uprise.org.au",
        "access-control-request-method": "GET",
      },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows inbound webhook without auth on unprefixed path", () => {
    const guard = createGuard();
    const context = executionContextWithRequest({
      path: "/inbound-text-message-hook",
      headers: {},
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows twilio status callback webhook without auth", () => {
    const guard = createGuard();
    const context = executionContextWithRequest({
      path: "/api/v1/twilio-status-callback",
      headers: {},
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects non-webhook requests without authorization", () => {
    const guard = createGuard();
    const context = executionContextWithRequest({
      path: "/api/v1/blasts",
      headers: {},
    });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it.each([
    "/api/v1/iam/magic-link",
    "/api/v1/iam/magic-link/consume",
    "/api/v1/iam/forgot-password",
    "/api/v1/iam/reset-password",
    "/api/v1/iam/verify-email/send",
    "/api/v1/iam/verify-email/confirm",
    "/api/v1/iam/2fa/send",
    "/api/v1/iam/2fa/verify",
    "/api/v1/iam/invite/abc123", // preview (param route)
    "/api/v1/iam/invite/accept",
  ])("allows pre-session IAM flow %s without auth", (path) => {
    const guard = createGuard();
    const context = executionContextWithRequest({ path, headers: {} });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("requires auth for /iam/select-tenant (not a pre-session flow)", () => {
    const guard = createGuard();
    const context = executionContextWithRequest({ path: "/api/v1/iam/select-tenant", headers: {} });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("allows requests with valid basic auth credentials", () => {
    const guard = createGuard();
    const token = Buffer.from("admin:secret").toString("base64");
    const context = executionContextWithRequest({
      path: "/api/v1/blasts",
      headers: { authorization: `Basic ${token}` },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects requests with invalid basic auth credentials", () => {
    const guard = createGuard();
    const token = Buffer.from("admin:wrong").toString("base64");
    const context = executionContextWithRequest({
      path: "/api/v1/blasts",
      headers: { authorization: `Basic ${token}` },
    });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("allows cron dispatch with valid bearer token", () => {
    const guard = createGuard();
    const context = executionContextWithRequest({
      path: "/api/v1/blasts/dispatch-due",
      headers: { authorization: "Bearer cron-secret" },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects cron dispatch with invalid bearer token", () => {
    const guard = createGuard();
    const context = executionContextWithRequest({
      path: "/api/v1/blasts/dispatch-due",
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("allows audience import dispatch with valid bearer token", () => {
    const guard = createGuard();
    const context = executionContextWithRequest({
      path: "/api/v1/audiences/dispatch-imports",
      headers: { authorization: "Bearer cron-secret" },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows analytics stream requests with a valid signed stream token", () => {
    const guard = createGuard();
    const streamToken = createStreamToken("stream-secret", 300).token;
    const context = executionContextWithRequest({
      path: "/api/v1/analytics/stream",
      query: { token: streamToken },
      headers: {},
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects analytics stream requests with an invalid stream token", () => {
    const guard = createGuard();
    const context = executionContextWithRequest({
      path: "/api/v1/analytics/stream",
      query: { token: "invalid" },
      headers: {},
    });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("allows analytics stream requests signed with fallback integration secret", () => {
    const guard = createGuard({ streamTokenSecret: "", integrationSecret: "integration-secret" });
    const streamToken = createStreamToken("integration-secret", 300).token;
    const context = executionContextWithRequest({
      path: "/api/v1/analytics/stream",
      query: { token: streamToken },
      headers: {},
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects analytics stream requests when stream secrets are not configured", () => {
    const guard = createGuard({ streamTokenSecret: "", integrationSecret: "" });
    const streamToken = createStreamToken("stream-secret", 300).token;
    const context = executionContextWithRequest({
      path: "/api/v1/analytics/stream",
      query: { token: streamToken },
      headers: {},
    });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  // Builds a context that returns THIS request object (no copy), so we can
  // assert on the principal the guard attaches to request.user.
  function contextSharing(request: any): ExecutionContext {
    request.url = request.url ?? request.path;
    request.originalUrl = request.originalUrl ?? request.path;
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it("attaches an ORGANISER principal for the env super-admin", () => {
    const guard = createGuard();
    const token = Buffer.from("admin:secret").toString("base64");
    const request: any = { path: "/api/v1/blasts", headers: { authorization: `Basic ${token}` } };
    expect(guard.canActivate(contextSharing(request))).toBe(true);
    expect(request.user).toEqual(
      expect.objectContaining({ id: "env-admin", role: "ORGANISER" }),
    );
  });

  describe("per-user (AppUser) login when a DB is wired", () => {
    const { hashPassword } = require("./password.util");

    function createGuardWithUsers(users: Record<string, any>) {
      const config = {
        get: (key: string) => {
          if (key === "BASIC_AUTH_USERNAME") return "admin";
          if (key === "BASIC_AUTH_PASSWORD") return "secret";
          return undefined;
        },
      } as ConfigService;
      // Identity (User) and membership (TenantMember) are separate tables now.
      const prisma = {
        user: { findUnique: async ({ where }: any) => users[where.email] ?? null },
        tenantMember: {
          findFirst: async ({ where }: any) => {
            const u = Object.values(users).find((x: any) => x.id === where.userId) as any;
            // A fixture without `tenantId` models a user with no membership.
            return u && u.tenantId ? { tenantId: u.tenantId, role: u.role } : null;
          },
        },
      } as any;
      return new BasicAuthGuard(config, prisma);
    }

    it("authenticates a volunteer and attaches their role + org", async () => {
      const passwordHash = await hashPassword("walkfast");
      const guard = createGuardWithUsers({
        "canv@org.au": { id: "u1", role: "VOLUNTEER", tenantId: "org1", email: "canv@org.au", passwordHash },
      });
      const token = Buffer.from("canv@org.au:walkfast").toString("base64");
      const request: any = { path: "/api/v1/canvass/assignments", headers: { authorization: `Basic ${token}` } };
      const result = await guard.canActivate(contextSharing(request));
      expect(result).toBe(true);
      expect(request.user).toEqual(
        expect.objectContaining({ id: "u1", role: "VOLUNTEER", tenantId: "org1" }),
      );
    });

    it("rejects a wrong AppUser password", async () => {
      const passwordHash = await hashPassword("walkfast");
      const guard = createGuardWithUsers({
        "canv@org.au": { id: "u1", role: "VOLUNTEER", tenantId: "org1", email: "canv@org.au", passwordHash },
      });
      const token = Buffer.from("canv@org.au:wrong").toString("base64");
      const request: any = { path: "/api/v1/canvass/assignments", headers: { authorization: `Basic ${token}` } };
      await expect(guard.canActivate(contextSharing(request))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects a valid password when the user has no tenant membership", async () => {
      const passwordHash = await hashPassword("walkfast");
      // No `tenantId` on the fixture → tenantMember.findFirst returns null.
      const guard = createGuardWithUsers({
        "orphan@org.au": { id: "u2", email: "orphan@org.au", passwordHash },
      });
      const token = Buffer.from("orphan@org.au:walkfast").toString("base64");
      const request: any = { path: "/api/v1/canvass/assignments", headers: { authorization: `Basic ${token}` } };
      await expect(guard.canActivate(contextSharing(request))).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

describe("BasicAuthGuard session auth", () => {
  const config = { get: () => undefined } as unknown as ConfigService;
  // Non-copying context so guard mutations to request.user are observable.
  const ctx = (request: any): ExecutionContext =>
    ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

  it("authenticates a Bearer session token and attaches the CASL actor", async () => {
    const sessions = {
      resolve: jest.fn().mockResolvedValue({ userId: "u1", email: "a@b.c", tenantId: "t1", role: "ORGANISER" }),
    } as any;
    const guard = new BasicAuthGuard(config, undefined, sessions);
    const request: any = {
      path: "/api/v1/canvass/assignments",
      headers: { authorization: "Bearer sess_token" },
    };
    await expect(guard.canActivate(ctx(request))).resolves.toBe(true);
    expect(request.user).toEqual(
      expect.objectContaining({
        id: "u1",
        role: "ORGANISER",
        tenantId: "t1",
        roles: ["organiser"],
        isSuperAdmin: false,
      }),
    );
    expect(sessions.resolve).toHaveBeenCalledWith("sess_token", expect.any(Object));
  });

  it("reads the session token from the auth_token cookie", async () => {
    const sessions = {
      resolve: jest.fn().mockResolvedValue({ userId: "u2", email: "c@d.e", tenantId: "t1", role: "VOLUNTEER" }),
    } as any;
    const guard = new BasicAuthGuard(config, undefined, sessions);
    const request: any = { path: "/api/v1/inbox", headers: { cookie: "foo=bar; auth_token=cookie_tok" } };
    await expect(guard.canActivate(ctx(request))).resolves.toBe(true);
    expect(sessions.resolve).toHaveBeenCalledWith("cookie_tok", expect.any(Object));
    expect(request.user.roles).toEqual(["volunteer"]);
  });

  it("rejects an invalid or expired session token", async () => {
    const sessions = { resolve: jest.fn().mockResolvedValue(null) } as any;
    const guard = new BasicAuthGuard(config, undefined, sessions);
    const request: any = { path: "/api/v1/inbox", headers: { authorization: "Bearer bad" } };
    await expect(guard.canActivate(ctx(request))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
