/**
 * What must never reach durable log storage.
 *
 * `DomainLogger` context objects today carry ids — `syncJobId`, `connectionId`, `tenantId` — and
 * that is the convention worth keeping. But writing context to `ops.LogEvent` turns "we tend not to
 * log secrets" from a habit into a promise, and a habit is not enforceable. So the promise is made
 * here, mechanically, on the write path.
 *
 * Matching is on the KEY, case-insensitively and by substring, because the risk is a future caller
 * inventing `userEmail` or `twilioAuthToken` — names nobody thought to list. A key-substring rule
 * catches those; an exact-match allowlist would not.
 *
 * Redaction replaces rather than drops, so the shape of the object survives and a reader can see
 * that a field existed. Knowing a credential was present in the context is diagnostically useful;
 * knowing its value is not worth the liability.
 */

/** Key fragments that mark a value as sensitive. Lower-case; matched as substrings. */
const SENSITIVE_KEY_FRAGMENTS = [
  "password",
  "secret",
  "token",
  "credential",
  "apikey",
  "authorization",
  "cookie",
  "sessionid",
  "phone",
  "mobile",
  "email",
  "taxfilenumber",
  "abn",
  "acn",
  "address",
  "dob",
  "birth",
] as const;

export const REDACTED = "[redacted]";

/** Deep-object guard: context is arbitrary caller data and could be self-referential. */
const MAX_DEPTH = 6;

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

/**
 * A copy of `value` with every sensitive key's value replaced by `[redacted]`.
 *
 * Total and non-throwing: this runs on the logging path, where an exception would lose the very
 * error being reported. Anything it cannot serialise degrades to a string.
 */
export function redactContext(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth >= MAX_DEPTH) return "[truncated]";

  if (Array.isArray(value)) return value.map((item) => redactContext(item, depth + 1));

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return `${value.name}: ${value.message}`;

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redactContext(nested, depth + 1);
    }
    return out;
  }

  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return String(value);
  return value;
}

/** The redacted context as a plain object, or undefined when there is nothing worth storing. */
export function redactedContextObject(
  context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!context || Object.keys(context).length === 0) return undefined;
  const redacted = redactContext(context);
  return redacted && typeof redacted === "object" && !Array.isArray(redacted)
    ? (redacted as Record<string, unknown>)
    : undefined;
}
