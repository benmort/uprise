"use client";

import * as React from "react";
import { CalendarPlus } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { googleCalendarUrl, icsDataUrl, type CalendarEventInput } from "../lib/calendar-links";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "event";
}

/** "Add to calendar" — a small menu offering Google Calendar + a downloadable .ics (Apple/Outlook). */
export function AddToCalendar({ event, className }: { event: CalendarEventInput; className?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={cn("relative inline-block", className)} onMouseLeave={() => setOpen(false)}>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <CalendarPlus className="mr-1.5 h-4 w-4" />
        Add to calendar
      </Button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-surface shadow-card">
          <a
            href={googleCalendarUrl(event)}
            target="_blank"
            rel="noreferrer"
            className="block px-3 py-2 text-sm text-foreground hover:bg-surface-variant"
            onClick={() => setOpen(false)}
          >
            Google Calendar
          </a>
          <a
            href={icsDataUrl(event)}
            download={`${slugify(event.title)}.ics`}
            className="block px-3 py-2 text-sm text-foreground hover:bg-surface-variant"
            onClick={() => setOpen(false)}
          >
            Apple / Outlook (.ics)
          </a>
        </div>
      ) : null}
    </div>
  );
}
