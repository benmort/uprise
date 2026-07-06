/**
 * Exponential reconnect backoff (ms) for the realtime inbox stream, capped at 60s.
 * Attempt 1 → 2s, doubling each attempt, capped at 60s from attempt 6 on.
 *
 * Kept pure + separate from the hook so a persistent failure (e.g. the API's
 * STREAM_TOKEN_SECRET unset, which makes the stream-token request fail and the
 * browser re-log a CORS/network error on every retry) backs off to occasional
 * retries instead of hammering every 10s — cutting the console noise while still
 * recovering on its own within a minute once the API is healthy again.
 */
export function nextReconnectDelay(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.min(Math.max(attempts, 1), 6));
}
