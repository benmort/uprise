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
  "PublicEventsController", // public event RSVP: gated per-event by publicRsvpEnabled, basic-auth allowlisted
  "DialerIvrController", // autodialer IVR/TwiML webhooks; every route verifies the per-subaccount Twilio signature
  "PublicActionsController", // public action pages: published-only service gating; session mint is rate-limited + captcha-gated
]);

// Specific open routes on otherwise-gated controllers, keyed "ControllerClass#method".
const OPEN_ROUTES = new Set<string>([
  "AuthController#check", // returns the caller's own identity
  "AnalyticsController#stream", // SSE; authenticated by the signed stream-token (tenant-scoped)
  "PushController#config2", // returns only the public VAPID key + enabled flag
  "TenantsController#available", // public sign-up slug-availability check (basic-auth allowlisted)
  "TenantsController#brand", // public tenant brand-by-slug for the volunteer auth panel
  "PlansController#listPublic", // public pricing (marketing) — no tenant data
  "PlatformStatusController#publicStatus", // public status page (marketing) — named services, uptime, incidents
  "PlatformStatusController#record", // status history cron (Bearer CRON_SECRET)
  "PlatformStatusController#recordGet", // status history cron (GET variant)
  // Platform cron (Bearer CRON_SECRET; no session) — dispatch/sweep/poll endpoints. The
  // provisioning polls also carry an inline super-admin check for any user-session caller.
  "BlastsController#dispatchDue",
  "AudiencesController#dispatchImports",
  "IntegrationsController#dispatchRefresh", // audience auto-refresh cron (Bearer CRON_SECRET)
  "IntegrationsController#crmPushSweep", // push-delivery sweep cron (Bearer CRON_SECRET)
  "JourneysController#sweepDue",
  "TelephonyProvisioningController#poll",
  // Private-pool re-sync (Bearer CRON_SECRET; inline super-admin check for any user session).
  // Deliberately an endpoint and not only the CLI script: it encrypts an auth token and writes
  // an inbound webhook URL, both environment-derived, so it has to run inside the deployment.
  "TelephonyProvisioningController#syncPrivatePool",
  // Private-pool re-sync (Bearer CRON_SECRET; inline super-admin check for any user session).
  // Deliberately an endpoint and not only the CLI script: it encrypts an auth token and writes
  // an inbound webhook URL, both environment-derived, so it has to run inside the deployment.
  "EmailProvisioningController#poll",
  "EventsController#dispatchDueReminders", // cron sweep (Bearer CRON_SECRET)
  "EventsController#dispatchDueRemindersGet", // cron sweep (GET variant)
  "CallsController#reconcile", // stale-call reconciliation sweep (cron; inline super-admin check)
  // Dial-engine cron tick (Bearer CRON_SECRET; inline super-admin check for any user session).
  // Keyed to AutodialerOpsController: the routes that live at /autodialer/* were split out of
  // AutodialerController into their own class, and this allowlist key kept the old name — which
  // is precisely the gap this guardrail exists to catch, so it failed until renamed.
  "AutodialerOpsController#dispatchDue",
  // Error intake from the Next apps' error boundaries (basic-auth allowlisted). Open on
  // purpose: the errors most worth capturing are the ones where auth failed or the app
  // never finished booting, so a gate here would blind us to exactly those. Write-only –
  // it inserts one capped, validated row into ops.ErrorLog, reads nothing and returns
  // nothing (204). See errors.controller.ts.
  "ErrorsController#report",
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
