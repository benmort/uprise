import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { BasicAuthGuard } from "./basic-auth.guard";
import { createStreamToken } from "./stream-token";

function executionContextWithRequest(request: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe("BasicAuthGuard", () => {
  function createGuard(
    username = "admin",
    password = "secret",
    cronSecret = "cron-secret",
    streamTokenSecret = "stream-secret",
  ) {
    const config = {
      get: (key: string) => {
        if (key === "BASIC_AUTH_USERNAME") return username;
        if (key === "BASIC_AUTH_PASSWORD") return password;
        if (key === "CRON_SECRET") return cronSecret;
        if (key === "STREAM_TOKEN_SECRET") return streamTokenSecret;
        if (key === "INTEGRATION_CREDENTIAL_SECRET") return "integration-secret";
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
        origin: "https://yarns.org.au",
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

  it("rejects non-webhook requests without authorization", () => {
    const guard = createGuard();
    const context = executionContextWithRequest({
      path: "/api/v1/blasts",
      headers: {},
    });
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
});
