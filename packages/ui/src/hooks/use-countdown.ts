"use client";

import { useEffect, useState } from "react";

export type CountdownStatus = "draft" | "upcoming" | "ongoing" | "completed" | "cancelled";

/**
 * A live, human "starts in …" label that ticks each minute. Switches to "Happening now" during
 * the event and "Ended" after; respects a passed derived status for draft/cancelled. Client-only
 * (setInterval). Consume from a client component.
 */
export function useCountdown(
  startsAt: string | Date,
  endsAt: string | Date,
  status?: CountdownStatus,
): string {
  const start = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  const end = typeof endsAt === "string" ? new Date(endsAt) : endsAt;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (status === "cancelled") return "Cancelled";
  if (status === "draft") return "Draft";
  if (now >= start && now <= end) return "Happening now";
  if (now > end) return "Ended";

  const mins = Math.max(0, Math.round((start.getTime() - now.getTime()) / 60_000));
  if (mins < 60) return `Starts in ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Starts in ${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `Starts in ${days}d ${hrs % 24}h`;
  const weeks = Math.floor(days / 7);
  return `Starts in ${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}
