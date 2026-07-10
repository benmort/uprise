import { Test } from "@nestjs/testing";
import { ModulesContainer, Reflector } from "@nestjs/core";
import { METHOD_METADATA } from "@nestjs/common/constants";
import { AppModule } from "../app.module";
import { REQUIRE_PERMISSION_KEY } from "./require-permission.decorator";
import { ROLES_KEY } from "./roles.decorator";
import { SUPER_ADMIN_KEY } from "./super-admin.decorator";

/**
 * Authorization guardrail. The guard stack is opt-in — AbilityGuard/RolesGuard/SuperAdminGuard
 * all allow-by-default, so a route with no `@RequirePermission` / `@Roles` / `@SuperAdmin`
 * (at method or class level) is reachable by ANY authenticated user. Nothing else scans for
 * that gap. This test enumerates every route handler and FAILS on any un-gated one that isn't
 * on the explicit allowlist below.
 *
 * The allowlist encodes deliberate open routes and mirrors the path allowlists inside
 * `basic-auth.guard.ts` (public / webhook / cron / auth-issuance) plus self-scoped identity
 * routes (they only ever touch the caller's own userId) and the token-gated analytics SSE.
 * ADDING an entry here is a security decision — justify it in review.
 */

// Whole controllers that are intentionally open (public, webhook, or pre-session auth issuance).
const OPEN_CONTROLLERS = new Set<string>([
  "HealthController", // uptime probe
  "MarketingController", // public forms (captcha-gated), no auth
  "WebhooksController", // provider callbacks; each verifies a provider signature
  "RegistrationController", // /auth/register + request-access — issue/await a session
  "AuthFlowsController", // magic-link / reset / verify / 2fa / phone / invite / open-join — issuance
  "IamController", // sessions login/logout + my-sessions (self) + select-tenant (session self)
  "ProfileController", // self-scoped: operates only on the caller's own userId
  "PublicInsightsController", // public poll viewer (action app): isPublic-only, basic-auth allowlisted
]);

// Specific open routes on otherwise-gated controllers, keyed "ControllerClass#method".
const OPEN_ROUTES = new Set<string>([
  "AuthController#check", // returns the caller's own identity
  "AnalyticsController#stream", // SSE; authenticated by the signed stream-token (tenant-scoped)
  "PushController#config2", // returns only the public VAPID key + enabled flag
  "TenantsController#available", // public sign-up slug-availability check (basic-auth allowlisted)
  "TenantsController#brand", // public tenant brand-by-slug for the volunteer auth panel
  "PlansController#listPublic", // public pricing (marketing) — no tenant data
  // Platform cron (Bearer CRON_SECRET; no session) — dispatch/sweep/poll endpoints. The
  // provisioning polls also carry an inline super-admin check for any user-session caller.
  "BlastsController#dispatchDue",
  "AudiencesController#dispatchImports",
  "JourneysController#sweepDue",
  "TelephonyProvisioningController#poll",
  "EmailProvisioningController#poll",
]);

describe("route authorization guardrail", () => {
  it("every route is gated (@RequirePermission / @Roles / @SuperAdmin) or explicitly allowlisted", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const reflector = moduleRef.get(Reflector);
    const modules = moduleRef.get(ModulesContainer);

    const ungated: string[] = [];

    for (const module of modules.values()) {
      for (const wrapper of module.controllers.values()) {
        const instance = wrapper.instance as Record<string, unknown> | undefined;
        const metatype = wrapper.metatype as (new (...args: unknown[]) => unknown) | undefined;
        if (!instance || !metatype) continue;
        const controllerName = metatype.name;
        if (OPEN_CONTROLLERS.has(controllerName)) continue;

        // A class-level gate covers every method (e.g. controllers with @Roles(ORGANISER)).
        const classGated =
          reflector.get(ROLES_KEY, metatype) ||
          reflector.get(REQUIRE_PERMISSION_KEY, metatype) ||
          reflector.get(SUPER_ADMIN_KEY, metatype);
        if (classGated) continue;

        const proto = Object.getPrototypeOf(instance);
        for (const method of Object.getOwnPropertyNames(proto)) {
          if (method === "constructor") continue;
          const handler = (proto as Record<string, unknown>)[method];
          if (typeof handler !== "function") continue;
          // Route handlers carry METHOD_METADATA (the HTTP verb). Non-routes don't.
          if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;

          const key = `${controllerName}#${method}`;
          if (OPEN_ROUTES.has(key)) continue;

          const gated =
            reflector.get(REQUIRE_PERMISSION_KEY, handler) ||
            reflector.get(ROLES_KEY, handler) ||
            reflector.get(SUPER_ADMIN_KEY, handler);
          if (!gated) ungated.push(key);
        }
      }
    }

    await moduleRef.close();

    // Any entry here is a route reachable by every authenticated user with no gate — either
    // add the right @RequirePermission/@Roles/@SuperAdmin, or (if deliberately open) allowlist it.
    expect(ungated.sort()).toEqual([]);
  });
});
