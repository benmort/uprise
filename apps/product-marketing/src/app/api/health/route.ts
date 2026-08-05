/**
 * Health probe for the platform status page. The API fetches it per app – see
 * apps/api/src/platform-status/.
 *
 * The site is mostly static, so a 200 here is a narrow claim: the function booted and the CDN is
 * answering. That is still what a visitor means by "is the website up", and it is the same claim
 * every other row on the status page makes. Public by design: no data, no side effects.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { ok: true, app: "product-marketing" },
    { headers: { "cache-control": "no-store" } },
  );
}
