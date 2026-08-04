/**
 * Calling-window evaluation in the TENANT's timezone.
 *
 * The source dialler compared server-local `HH*100+MM` against the campaign's
 * window, so a campaign authored in Sydney and served from a US region rang
 * people at 3 am. Here the wall-clock is derived with Intl in the tenant's own
 * timezone, and the window supports overnight wrap (start > finish, e.g. an
 * election-eve 18:00–06:00 push).
 */

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const DEFAULT_TENANT_TIMEZONE = "Australia/Sydney";

/** Tenant.settings is untyped Json by convention; `timezone` is the agreed key. */
export function resolveTenantTimezone(settings: unknown): string {
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    const tz = (settings as Record<string, unknown>).timezone;
    if (typeof tz === "string" && tz.trim()) {
      try {
        // Throws on an unknown IANA name — fall back rather than crash a tick.
        new Intl.DateTimeFormat("en-AU", { timeZone: tz.trim() });
        return tz.trim();
      } catch {
        return DEFAULT_TENANT_TIMEZONE;
      }
    }
  }
  return DEFAULT_TENANT_TIMEZONE;
}

/** "HH:MM" → minutes since midnight, or null when malformed. */
export function parseHhMm(value: string): number | null {
  const match = HHMM_RE.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** The wall-clock minutes-since-midnight of `now` in `timeZone` (DST-correct). */
export function minutesOfDayIn(timeZone: string, now: Date): number {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/**
 * Is `now` inside the campaign's calling window, evaluated in `timeZone`?
 *
 * start === finish is treated as a MALFORMED window (closed) rather than
 * "always open" — an always-open dialler should say so with 00:00–23:59.
 * Malformed HH:MM strings also evaluate closed: fail-safe, never fail-dial.
 */
export function isWithinCallingWindow(
  campaign: { dailyStart: string; dailyFinish: string },
  timeZone: string,
  now: Date = new Date(),
): boolean {
  const start = parseHhMm(campaign.dailyStart);
  const finish = parseHhMm(campaign.dailyFinish);
  if (start === null || finish === null || start === finish) return false;

  const current = minutesOfDayIn(timeZone, now);
  if (start < finish) return current >= start && current < finish;
  // Overnight wrap: open from start until midnight, and from midnight to finish.
  return current >= start || current < finish;
}
