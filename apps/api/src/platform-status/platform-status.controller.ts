import { Controller, Get } from "@nestjs/common";
import { PlatformStatusService } from "./platform-status.service";
import { SuperAdmin } from "../auth/super-admin.decorator";

/**
 * Platform status, for the two /status pages.
 *
 * The split is the security boundary. `GET /platform-status` carries deploy shas, project names
 * and origins, so it is @SuperAdmin — a platform-operator view no tenant role, not even OWNER,
 * should reach. `GET /platform-status/public` is unauthenticated (allowlisted in BasicAuthGuard
 * and in the route-authorization guardrail) and returns only named services, a word each and a
 * mock version, all of it assembled server-side so nothing internal is on the wire to begin with.
 */
@Controller("platform-status")
export class PlatformStatusController {
  constructor(private readonly status: PlatformStatusService) {}

  /** Public status page (marketing site) — no auth, no internal detail. */
  @Get("public")
  publicStatus() {
    return this.status.publicStatus();
  }

  /** Internal status page (admin) — every app, with deploy shas. */
  @Get()
  @SuperAdmin()
  full() {
    return this.status.status();
  }
}
