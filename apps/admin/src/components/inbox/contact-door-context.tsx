"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DoorOpen, UserRound } from "lucide-react";
import { searchContacts, getContactProfile, type TimelineEntry } from "@/lib/api/contacts";

/**
 * E2 inbox↔canvassing coupling: resolves the contact behind a thread (by phone),
 * links to their unified profile, and surfaces recent door-knock events as purple
 * chips so a responder sees the door history alongside the text thread.
 */
export function ContactDoorContext({ phone }: { phone: string }) {
  const [contactId, setContactId] = useState<string | null>(null);
  const [knocks, setKnocks] = useState<TimelineEntry[]>([]);

  useEffect(() => {
    let alive = true;
    setContactId(null);
    setKnocks([]);
    void (async () => {
      const found = await searchContacts(phone);
      if (!alive || !found.ok || found.data.length === 0) return;
      const id = found.data[0].id;
      setContactId(id);
      const profile = await getContactProfile(id);
      if (!alive || !profile.ok) return;
      setKnocks(profile.data.timeline.filter((e) => e.kind === "knock").slice(0, 3));
    })();
    return () => {
      alive = false;
    };
  }, [phone]);

  if (!contactId) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <Link
        href={`/contacts/${encodeURIComponent(contactId)}`}
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        <UserRound className="h-3.5 w-3.5" />
        View contact
      </Link>
      {knocks.map((k) => (
        <span
          key={k.id}
          className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--knock))]/[0.1] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--knock))]"
        >
          <DoorOpen className="h-3 w-3" />
          {k.kind === "knock" && k.dispositionCode
            ? k.dispositionCode.replaceAll("_", " ")
            : "Door knock"}
        </span>
      ))}
    </div>
  );
}
