/**
 * Recover structure from a raw provider log line.
 *
 * Vercel and Railway both store logs as strings, but everything this platform writes goes through
 * `DomainLogger`, which emits a fixed shape:
 *
 *   [Nest] <pid>  - <date>, <time>   <LEVEL> [UpriseApi] [<domain>] <message> {<json context>}
 *
 * so the domain and the context object can be parsed back out. That is what makes
 * `--domain integrations --level error` work against providers that only know about text, and it is
 * why a log line is worth parsing rather than grepping: the same `syncJobId` that took an hour to
 * find in a BullMQ job hash is right there in the context object.
 *
 * Everything here is best-effort and total: a line that matches nothing still comes back as a
 * record with the raw text as its message. A parser that throws on an unfamiliar line would blind
 * the very tool you reach for when something unfamiliar is happening.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogRecord = {
  /** ISO-8601. Falls back to the provider's own timestamp when the line carries none. */
  at: string;
  source: "vercel" | "railway" | "queue" | "stored";
  /** Vercel project name, "worker", or the queue name. */
  service: string;
  level: LogLevel;
  message: string;
  /** `DomainLogger`'s first argument – "integrations", "http", "worker", … */
  domain?: string;
  context?: Record<string, unknown>;
  /** The line as it arrived, minus ANSI. Kept so nothing is lost to a parsing miss. */
  raw?: string;
};

/** CSI escape sequences. Nest colourises by default and Railway stores the escapes verbatim. */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\[[0-9;]*m/g;

export function stripAnsi(input: string): string {
  return input.replace(ANSI_RE, "");
}

/**
 * Nest's level word → our four levels. Nest writes VERBOSE and LOG where we mean debug and info;
 * anything unrecognised is info rather than an error, so a format change can't manufacture alerts.
 */
const LEVEL_BY_NEST_WORD: Readonly<Record<string, LogLevel>> = {
  ERROR: "error",
  FATAL: "error",
  WARN: "warn",
  LOG: "info",
  DEBUG: "debug",
  VERBOSE: "debug",
};

export function normaliseLevel(raw: string | null | undefined): LogLevel {
  const key = (raw ?? "").trim().toUpperCase();
  return LEVEL_BY_NEST_WORD[key] ?? "info";
}

/** `[Nest] 1  - 08/06/2026, 5:59:28 AM   ERROR [UpriseApi] ` – the whole preamble. */
const NEST_PREAMBLE_RE =
  /^\[Nest\]\s*\d*\s*-?\s*(?<stamp>[\d/]+,\s*[\d:]+\s*(?:AM|PM)?)?\s*(?<level>ERROR|FATAL|WARN|LOG|DEBUG|VERBOSE)?\s*(?:\[(?<logger>[^\]]+)\]\s*)?/i;

/** A leading `[domain]` once the Nest preamble is gone. */
const DOMAIN_RE = /^\[(?<domain>[a-z0-9._-]+)\]\s*/i;

/**
 * Split a trailing JSON object off the end of a message.
 *
 * Scans backwards balancing braces rather than regex-matching, because context objects nest and
 * a greedy `\{.*\}$` would swallow a brace that belongs to the message. Strings are tracked so a
 * `}` inside a quoted value doesn't close the object early.
 */
export function splitTrailingJson(text: string): {
  message: string;
  context?: Record<string, unknown>;
} {
  const trimmed = text.trimEnd();
  if (!trimmed.endsWith("}")) return { message: trimmed };

  let depth = 0;
  let inString = false;
  for (let i = trimmed.length - 1; i >= 0; i -= 1) {
    const ch = trimmed[i];
    if (inString) {
      // Walking backwards, a quote ends the string unless it is itself escaped.
      if (ch === '"' && !isEscapedAt(trimmed, i)) inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "}") depth += 1;
    else if (ch === "{") {
      depth -= 1;
      if (depth === 0) {
        const candidate = trimmed.slice(i);
        try {
          const parsed = JSON.parse(candidate) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return {
              message: trimmed.slice(0, i).trimEnd(),
              context: parsed as Record<string, unknown>,
            };
          }
        } catch {
          // Not JSON after all — a message that merely ends in a brace. Keep it as text.
        }
        return { message: trimmed };
      }
    }
  }
  return { message: trimmed };
}

/** Whether the quote at `index` is escaped, counting the run of backslashes before it. */
function isEscapedAt(text: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

export type ParseInput = {
  message: string;
  source: LogRecord["source"];
  service: string;
  /** The provider's timestamp, used when the line carries none of its own. */
  at: string;
  /** The provider's severity, used when the line has no Nest level word. */
  severity?: string;
};

/**
 * Parse one provider line into a record. Total — never throws, always returns something.
 */
export function parseLogLine(input: ParseInput): LogRecord {
  const raw = stripAnsi(input.message).trimEnd();
  const base = { at: input.at, source: input.source, service: input.service, raw };

  const preamble = NEST_PREAMBLE_RE.exec(raw);
  // A line with no Nest preamble is a platform line (Vercel's request summaries, Railway's
  // container output). Keep it whole and take the level from the provider.
  if (!preamble || preamble[0].length === 0) {
    const { message, context } = splitTrailingJson(raw);
    return { ...base, level: normaliseLevel(input.severity), message, context };
  }

  const rest = raw.slice(preamble[0].length);
  const withDomain = DOMAIN_RE.exec(rest);
  const domain = withDomain?.groups?.domain;
  const body = withDomain ? rest.slice(withDomain[0].length) : rest;
  const { message, context } = splitTrailingJson(body);

  return {
    ...base,
    level: normaliseLevel(preamble.groups?.level ?? input.severity),
    domain,
    message,
    context,
  };
}

/** Does this record satisfy the CLI/API filters? Shared so every surface filters identically. */
export function matchesFilters(
  record: LogRecord,
  filters: { level?: LogLevel; domain?: string; q?: string },
): boolean {
  if (filters.level && !atLeastLevel(record.level, filters.level)) return false;
  if (filters.domain && record.domain !== filters.domain) return false;
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const haystack = `${record.message} ${JSON.stringify(record.context ?? {})}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

/** `--level warn` means warn AND error, the way every log tool behaves. */
export function atLeastLevel(actual: LogLevel, floor: LogLevel): boolean {
  return LEVEL_ORDER[actual] >= LEVEL_ORDER[floor];
}
