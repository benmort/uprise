/**
 * Add-to-calendar helpers — dependency-free. `icsContent`/`icsDataUrl` produce a downloadable
 * VEVENT (Apple/Outlook/most clients); `googleCalendarUrl` opens the Google "add event" template.
 */
export type CalendarEventInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string | Date;
  endsAt: string | Date;
  /** Canonical event URL, appended to the description so calendars link back. */
  url?: string | null;
};

/** A Date → the compact UTC stamp calendars expect: YYYYMMDDTHHMMSSZ. */
function toUtcStamp(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function stableUid(e: CalendarEventInput): string {
  let h = 0;
  const seed = `${e.title}|${toUtcStamp(e.startsAt)}`;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return `${Math.abs(h).toString(36)}@uprise`;
}

/** RFC-5545 VEVENT. `\r\n` line endings + escaped text, as the spec requires. */
export function icsContent(e: CalendarEventInput): string {
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const details = [e.description ?? "", e.url ? `\n${e.url}` : ""].join("").trim();
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//uprise//events//EN",
    "BEGIN:VEVENT",
    `UID:${stableUid(e)}`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    `DTSTART:${toUtcStamp(e.startsAt)}`,
    `DTEND:${toUtcStamp(e.endsAt)}`,
    `SUMMARY:${esc(e.title)}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    ...(details ? [`DESCRIPTION:${esc(details)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function icsDataUrl(e: CalendarEventInput): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent(e))}`;
}

export function googleCalendarUrl(e: CalendarEventInput): string {
  const details = [e.description ?? "", e.url ? `\n${e.url}` : ""].join("").trim();
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${toUtcStamp(e.startsAt)}/${toUtcStamp(e.endsAt)}`,
    ...(details ? { details } : {}),
    ...(e.location ? { location: e.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
