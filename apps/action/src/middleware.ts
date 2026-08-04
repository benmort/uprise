import { NextRequest, NextResponse } from "next/server";
import { buildFrameAncestors, type FramePolicy } from "./lib/frame-policy";

/**
 * Frame policy for the action-page routes (the admin `/embed/*` middleware is
 * the estate's precedent — App Router pages can't set response headers and
 * next.config headers are static, so the per-page dynamic CSP lives here).
 *
 * Scoped by the matcher to `/:tenant/actions/:slug*` only; every other route
 * in this app is untouched. The embed route also gets noindex + a microphone
 * Permissions-Policy (the widget needs the mic; nothing else may claim it).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
const POLICY_TIMEOUT_MS = 1500;

async function fetchFramePolicy(slug: string): Promise<{ policy: FramePolicy; failed: boolean }> {
  try {
    const res = await fetch(`${API_URL}/actions/public/pages/${encodeURIComponent(slug)}/frame-policy`, {
      // Edge-cached by the API for 60 s; the timeout keeps a slow API from
      // stalling every embed render (fail-closed below, not fail-open).
      signal: AbortSignal.timeout(POLICY_TIMEOUT_MS),
    });
    if (!res.ok) return { policy: null, failed: true };
    const json = (await res.json()) as { data?: { embedDomains?: string[] } } & { embedDomains?: string[] };
    const body = json?.data ?? json;
    return { policy: { embedDomains: body?.embedDomains ?? [] }, failed: false };
  } catch {
    return { policy: null, failed: true };
  }
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean); // [tenant, "actions", slug, ...rest]
  const slug = parts[2] ?? "";
  const isEmbedRoute = parts[3] === "embed";

  const { policy, failed } = isEmbedRoute
    ? await fetchFramePolicy(slug)
    : { policy: null, failed: false };

  const res = NextResponse.next();
  const csp = buildFrameAncestors({ isEmbedRoute, policy, policyFetchFailed: failed });
  if (csp) res.headers.set("Content-Security-Policy", csp);
  if (isEmbedRoute) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("Permissions-Policy", "microphone=(self)");
  }
  return res;
}

export const config = {
  matcher: ["/:tenant/actions/:slug*"],
};
