/**
 * Health probe for the platform status page. The API fetches it per app – see
 * apps/api/src/platform-status/.
 *
 * Deliberately trivial: a 200 here means this app's function booted and is serving, which is the
 * whole question a status page asks of a frontend. Dependency checks belong to the API's
 * /api/v1/health – signing in is the API's job, not this app's. Public by design: no data, no
 * side effects.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ ok: true, app: "auth" }, { headers: { "cache-control": "no-store" } });
}
