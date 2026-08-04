import type { DialerCampaignRecord } from "@uprise/contracts";
import type { DialerBehaviourKey } from "@/lib/autodialer";

/** Resolve a campaign's behaviour matrix back to its picker key + label. */
export function behaviourOf(campaign: {
  survey: boolean;
  electoralTarget: boolean;
  transparentTargetTransfer: boolean;
}): { key: DialerBehaviourKey; label: string } {
  if (campaign.survey) return { key: "survey", label: "Survey" };
  if (campaign.electoralTarget) return { key: "target", label: "Electoral target" };
  if (campaign.transparentTargetTransfer) return { key: "transfer", label: "Transfer" };
  return { key: "broadcast", label: "Broadcast" };
}

export type DialerCampaignRow = DialerCampaignRecord;
