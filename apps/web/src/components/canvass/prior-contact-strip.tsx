"use client";

import { DoorOpen, MessageSquare, Send } from "lucide-react";
import type { TimelineEntry } from "@/lib/api/contacts";

/** Relative "2d ago"-style stamp, kept tiny + dependency-free. */
function ago(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function summarise(e: TimelineEntry): { icon: typeof DoorOpen; text: string } {
  if (e.kind === "knock") {
    return { icon: DoorOpen, text: e.dispositionCode ? e.dispositionCode.replaceAll("_", " ") : "Door knock" };
  }
  if (e.kind === "text_in") return { icon: MessageSquare, text: e.body || "Inbound text" };
  return { icon: Send, text: e.body || "Outbound text" };
}

/**
 * The informed-knock strip (#1 field priority): the most recent prior contacts
 * so the canvasser walks up knowing the history. Shows up to `limit` events.
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
    <div className="rounded-2xl border border-[#d4def9] bg-[#eef2fd] p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-primary">
        Walk up informed · recent contact
      </p>
      <ul className="space-y-1.5">
        {recent.map((e) => {
          const { icon: Icon, text } = summarise(e);
          const door = e.kind === "knock";
          return (
            <li key={e.id} className="flex items-center gap-2 text-sm">
              <Icon className={door ? "h-3.5 w-3.5 shrink-0 text-[hsl(var(--knock))]" : "h-3.5 w-3.5 shrink-0 text-primary"} />
              <span className="min-w-0 flex-1 truncate text-foreground">{text}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{ago(e.at)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
