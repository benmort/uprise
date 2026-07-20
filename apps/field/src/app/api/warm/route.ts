/**
 * Keep-warm target for the Vercel cron (vercel.json): a 204 that exists purely so the
 * serverless function bundle stays hot — volunteers arrive in bursts after idle hours,
 * and without this the first one pays the cold start. Public by design (no data, no
 * side effects); the SSO middleware matcher excludes this path so the cron's
 * unauthenticated GET reaches the lambda instead of bouncing at the edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  // One line per hit (cron = every 5 min) so the warming is observable in `vercel logs` —
  // without it the 204 emits nothing and the cron's firing can't be verified from outside.
  console.log(`warm ping (ua: ${req.headers.get("user-agent") ?? "unknown"})`);
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
