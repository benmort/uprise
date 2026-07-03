import * as React from "react";
import { Inbox as InboxIcon, MapPin, SendHorizontal } from "lucide-react";
import { normaliseChannel } from "@/components/channels/channel-campaigns-view";
import type { CampaignLive } from "@/lib/api/campaigns";

/**
 * Single source of truth for the cross-domain "Recent activity" feed (blasts +
 * inbound replies + door knocks). Consumed by the dashboard module and the topbar
 * notifications bell so both stay in lock-step.
 */
export type ActivityItem = {
  id: string;
  icon?: React.ReactNode;
  label: string;
  sublabel?: string;
  at: string;
  href?: string;
};

type CampaignActivity = { live?: CampaignLive } | null | undefined;

/** "just now" / "5m ago" / "2h ago" / "39d ago". */
export function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diffMs = Date.now() - t;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/** Merge the three sources, drop undated rows, sort newest-first, cap at `limit`. */
export function buildActivityItems(
  blasts: Array<Record<string, unknown>> | undefined,
  convos: Array<Record<string, unknown>> | undefined,
  campaign: CampaignActivity,
  limit = 12,
): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const b of blasts ?? []) {
    const at = String((b as any).sentAt || (b as any).createdAt || "");
    if (!at) continue;
    items.push({
      id: `blast-${String(b.id)}`,
      icon: <SendHorizontal className="h-4 w-4" />,
      label: `Blast: ${String(b.title || "Untitled")}`,
      sublabel: `${String(b.status || "DRAFTED")} · ${normaliseChannel(b.channel)}`,
      at,
      href: `/blasts/${encodeURIComponent(String(b.id))}`,
    });
  }

  for (const c of convos ?? []) {
    const at = String((c as any).lastMessageAt || "");
    if (!at) continue;
    const phone = String((c as any).contactPhone || "");
    items.push({
      id: `convo-${phone}`,
      icon: <InboxIcon className="h-4 w-4" />,
      label: String((c as any).contactName || phone || "Conversation"),
      sublabel: "New reply in inbox",
      at,
      href: `/future/sms-inbox?contact=${encodeURIComponent(phone)}`,
    });
  }

  for (const k of campaign?.live?.recentKnocks ?? []) {
    items.push({
      id: `knock-${k.id}`,
      icon: <MapPin className="h-4 w-4" />,
      label: `Door knock${k.dispositionCode ? `: ${k.dispositionCode}` : ""}`,
      sublabel: k.volunteer || "Volunteer",
      at: k.at,
      href: "/canvass",
    });
  }

  return items
    .filter((i) => Number.isFinite(Date.parse(i.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}
