/**
 * Keep-warm target for the Vercel cron (vercel.json): a 204 that exists purely so the
 * serverless function bundle stays hot. The measured cold /volunteer TTFB was ~1.1s in
 * prod — volunteers hit this app in bursts at shift start, after hours of idle. Public
 * by design: no data, no side effects.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  // One line per hit (cron = every 5 min) so the warming is observable in `vercel logs` —
  // without it the 204 emits nothing and the cron's firing can't be verified from outside.
  console.log(`warm ping (ua: ${req.headers.get("user-agent") ?? "unknown"})`);
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
