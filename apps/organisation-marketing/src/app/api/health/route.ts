/**
 * Health probe for the platform status page. The API fetches it per app – see
 * apps/api/src/platform-status/.
 *
 * This is the Uprise Labs company site, so it carries no public service on the customer-facing
 * page – the row exists for the operator view only. A 200 means the function booted and the CDN is
 * answering. Public by design: no data, no side effects.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { ok: true, app: "organisation-marketing" },
    { headers: { "cache-control": "no-store" } },
  );
}
