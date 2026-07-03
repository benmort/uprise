/** Device metadata captured on sessions (login + last-seen stamping). */
export type RequestMeta = { userAgent: string | null; ipAddress: string | null };

type MetaSource = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string | null };
};

function header(req: MetaSource, name: string): string | null {
  const raw = req.headers?.[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || null;
}

/**
 * The real client IP + user agent for a request. Dev (ngrok) and prod (Vercel)
 * both sit behind proxies, so `request.ip` is just the proxy's loopback unless
 * `trust proxy` is configured — read the forwarding headers directly instead:
 * first hop of `x-forwarded-for` (the client, per both proxies' behaviour),
 * then `x-real-ip`, then the socket as the direct-connection fallback.
 */
export function requestMeta(req: MetaSource): RequestMeta {
  const forwarded = header(req, "x-forwarded-for");
  const firstHop = forwarded?.split(",")[0]?.trim() || null;
  const raw = firstHop ?? header(req, "x-real-ip") ?? req.ip ?? req.socket?.remoteAddress ?? null;
  // Normalise IPv4-mapped IPv6 (`::ffff:1.2.3.4` → `1.2.3.4`).
  const ipAddress = raw ? raw.replace(/^::ffff:/i, "").slice(0, 64) : null;
  const userAgent = header(req, "user-agent")?.slice(0, 512) ?? null;
  return { userAgent, ipAddress };
}
