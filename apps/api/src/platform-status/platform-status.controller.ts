import { Controller, Get, Header, Post } from "@nestjs/common";
import { PlatformStatusService } from "./platform-status.service";
import { SuperAdmin } from "../auth/super-admin.decorator";

/**
 * Platform status, for the two /status pages.
 *
 * The split is the security boundary. `GET /platform-status` carries deploy shas, project names
 * and origins, so it is @SuperAdmin — a platform-operator view no tenant role, not even OWNER,
 * should reach. `GET /platform-status/public` is unauthenticated (allowlisted in BasicAuthGuard
 * and in the route-authorization guardrail) and returns only named services, a word each and the
 * public history, all of it assembled server-side so nothing internal is on the wire to begin with.
 */
@Controller("platform-status")
export class PlatformStatusController {
  constructor(private readonly status: PlatformStatusService) {}

  /**
   * Public status page (marketing site) — no auth, no internal detail.
   *
   * Cached at the edge, not just in the process: the snapshot cache lives in one lambda's memory
   * and Vercel runs many short-lived ones, so without this every cold instance re-runs the full
   * fan-out (a probe per app plus two provider calls). A status page that points the estate's own
   * traffic at itself is a bad way to find out it works. `stale-while-revalidate` means a burst
   * is served instantly from the edge while one request refreshes behind it.
   */
  @Get("public")
  @Header("cache-control", "public, s-maxage=30, stale-while-revalidate=120")
  publicStatus() {
    return this.status.publicStatus();
  }

  /** Internal status page (admin) — every app, with deploy shas. */
  @Get()
  @SuperAdmin()
  full() {
    return this.status.status();
  }

  /**
   * Platform cron (Bearer CRON_SECRET, no session — allowlisted in BasicAuthGuard's cron paths).
   * Writes one check row and opens/resolves incidents; see vercel.json for the schedule.
   * GET as well as POST because Vercel's scheduler issues GETs.
   */
  @Get("record")
  recordGet() {
    return this.status.record();
  }

  @Post("record")
  record() {
    return this.status.record();
  }
}
