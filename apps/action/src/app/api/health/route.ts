/**
 * Health probe for the platform status page. The API fetches it per app – see
 * apps/api/src/platform-status/.
 *
 * Deliberately trivial: a 200 here means this app's function booted and is serving, which is the
 * whole question a status page asks of a frontend. The middleware matcher only covers
 * `/:tenant/actions/:slug*`, so this route is reachable without a tenant. Public by design: no
 * data, no side effects.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ ok: true, app: "action" }, { headers: { "cache-control": "no-store" } });
}
