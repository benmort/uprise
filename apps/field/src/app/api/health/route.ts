/**
 * Health probe for the platform status page. The API fetches it per app – see
 * apps/api/src/platform-status/.
 *
 * Deliberately trivial: a 200 here means this app's function booted and is serving. It says nothing
 * about a canvasser's offline queue, which is by design – that lives in the browser, not here.
 * Public, and excluded from the middleware matcher (like /api/warm) so the probe reaches the
 * function instead of bouncing to the auth app.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ ok: true, app: "field" }, { headers: { "cache-control": "no-store" } });
}
