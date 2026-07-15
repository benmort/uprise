"use client";

import { History, Home, MessageSquare } from "lucide-react";
import type { TimelineEntry } from "../api/contacts";

/** Day + short month, e.g. "3 May" — the prior-contact meta stamp. */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function summarise(e: TimelineEntry): {
  icon: typeof Home;
  quote: string;
  meta: string;
  door: boolean;
} {
  const date = fmtDate(e.at);
  if (e.kind === "knock") {
    const base = e.dispositionCode ? cap(e.dispositionCode.replaceAll("_", " ")) : "Door knock";
    return {
      icon: Home,
      quote: e.notes ? `${base} – ${e.notes}` : base,
      meta: `Door knock · ${date}`,
      door: true,
    };
  }
  const inbound = e.kind === "text_in";
  const channel = inbound ? "Inbound text" : "Outbound text";
  return {
    icon: MessageSquare,
    quote: e.body ? `“${e.body}”` : channel,
    meta: `${channel} · ${date}`,
    door: false,
  };
}

/**
 * The informed-knock strip (#1 field priority): the most recent prior contacts
 * so the volunteer walks up knowing the history. Shows up to `limit` events.
 */
export function PriorContactStrip({
  timeline,
  limit = 3,
}: {
  timeline: TimelineEntry[];
  limit?: number;
}) {
  const recent = timeline.slice(0, limit);
  if (recent.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-primary">
        <History className="h-3.5 w-3.5 shrink-0" />
        Walk up informed · recent contact
      </p>
      <ul className="mt-1 divide-y divide-border">
        {recent.map((e) => {
          const { icon: Icon, quote, meta, door } = summarise(e);
          return (
            <li key={e.id} className="flex items-start gap-3 py-3">
              <span
                className={
                  door
                    ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--knock-container))] text-[hsl(var(--knock))]"
                    : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                }
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{quote}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
