/**
 * Health probe for the platform status page (`/status` in this app, and the public one on the
 * marketing site). The API fetches it per app – see apps/api/src/platform-status/.
 *
 * Deliberately trivial: a 200 here means this app's function booted and is serving, which is the
 * whole question a status page asks of a frontend. Dependency checks (DB, Redis, providers) belong
 * to the API's /api/v1/health – this app has none of its own. Public by design, and excluded from
 * the middleware matcher so the probe reaches the function instead of bouncing to the auth app.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ ok: true, app: "admin" }, { headers: { "cache-control": "no-store" } });
}
