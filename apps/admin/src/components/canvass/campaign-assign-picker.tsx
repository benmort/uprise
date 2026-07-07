"use client";

import { useEffect, useState } from "react";
import { Select, SelectItem } from "@/components/ui/select";
import { listCampaigns, type CampaignChannel, type CampaignSummary } from "@/lib/api/campaigns";

const CHANNEL_LABEL: Record<CampaignChannel, string> = {
  BOTH: "Doors + SMS",
  DOOR: "Doors",
  SMS: "SMS",
};

/**
 * Assign a turf cut to a campaign (which carries its medium). Shared by every geo
 * explorer's cut affordance + the My-turf basket, so a cut can be attached from any
 * kind. Value "" = unattached (the backend then leaves the turf campaign-less and
 * skips boundary clipping). Shows each campaign's medium so the choice is explicit.
 */
export function CampaignAssignPicker({
  value,
  onChange,
  label = "Assign to campaign",
  id = "campaign-assign",
}: {
  value: string;
  onChange: (campaignId: string) => void;
  label?: string;
  id?: string;
}) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  useEffect(() => {
    let alive = true;
    void listCampaigns().then((res) => {
      if (alive && res.ok) setCampaigns(res.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
      >
        {label}
      </label>
      <Select id={id} value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectItem value="none">No campaign (unattached)</SelectItem>
        {campaigns.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name} · {CHANNEL_LABEL[c.channel]}
          </SelectItem>
        ))}
      </Select>
    </div>
  );
}
