"use client";

import { useEffect, useState } from "react";
import { getRecentBlasts, listConversations } from "@/lib/api";
import { listCampaigns, getCampaignLive, type CampaignLive } from "@/lib/api/campaigns";
import { buildActivityItems, type ActivityItem } from "./recent-activity";

/**
 * Standalone recent-activity feed for surfaces that aren't the dashboard (the topbar
 * notifications bell). The dashboard keeps its own fetches and calls buildActivityItems
 * directly — this hook bundles the same fetches for callers that have nothing else loaded.
 * Polls on the same 10s cadence as the inbox-unread sync in the shell.
 */
export function useRecentActivity(limit = 8): {
  items: ActivityItem[];
  loading: boolean;
  error?: string;
} {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const [blastsRes, convosRes] = await Promise.all([getRecentBlasts(), listConversations()]);
      if (!alive) return;

      let live: CampaignLive | undefined;
      const campaignsRes = await listCampaigns();
      if (alive && campaignsRes.ok) {
        const active = campaignsRes.data.find((c) => c.status === "ACTIVE") ?? campaignsRes.data[0];
        if (active) {
          const liveRes = await getCampaignLive(active.id);
          if (alive && liveRes.ok) live = liveRes.data;
        }
      }
      if (!alive) return;

      if (!blastsRes.ok && !convosRes.ok) {
        setError(blastsRes.ok ? undefined : blastsRes.error);
      } else {
        setError(undefined);
        setItems(
          buildActivityItems(
            blastsRes.ok ? blastsRes.data : undefined,
            convosRes.ok ? convosRes.data : undefined,
            live ? { live } : undefined,
            limit,
          ),
        );
      }
      setLoading(false);
    };

    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [limit]);

  return { items, loading, error };
}
