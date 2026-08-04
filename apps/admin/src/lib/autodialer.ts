import { autodialer } from "@uprise/api-client";

/**
 * Draft-first campaign creation (the createBlastAndOpen pattern): the type
 * picker chooses the ONE irreversible thing — the behaviour matrix — and
 * everything else is edited on the campaign workbench it opens into.
 */

export type DialerBehaviourKey = "broadcast" | "survey" | "transfer" | "target";

export const DIALER_BEHAVIOUR_OPTIONS: Array<{
  key: DialerBehaviourKey;
  title: string;
  description: string;
}> = [
  {
    key: "broadcast",
    title: "Broadcast",
    description: "Play a recorded or spoken message to an audience, with the opt-out star.",
  },
  {
    key: "survey",
    title: "Survey (robo-poll)",
    description: "Ask keypad questions along a branching graph; answers feed dispositions.",
  },
  {
    key: "transfer",
    title: "Transfer",
    description: "Patch answered calls through to fixed target numbers.",
  },
  {
    key: "target",
    title: "Electoral target",
    description: "Ask for a postcode and connect callers to their own member's office.",
  },
];

/** The behaviour matrix each picker card sets — the source vocabulary, as-is. */
export function behaviourFlags(key: DialerBehaviourKey): {
  outboundOnly: boolean;
  survey: boolean;
  electoralTarget: boolean;
  transparentTargetTransfer: boolean;
} {
  return {
    outboundOnly: true,
    survey: key === "survey",
    electoralTarget: key === "target",
    transparentTargetTransfer: key === "transfer",
  };
}

type Nav = { push: (href: string) => void };
type Toast = (input: {
  tone: "success" | "error" | "warning" | "info";
  title: string;
  description?: string;
}) => void;

export async function createDialerCampaignAndOpen(
  router: Nav,
  showToast: Toast,
  behaviour: DialerBehaviourKey,
  name = "New calling campaign",
): Promise<string | null> {
  const created = await autodialer.create({ name, ...behaviourFlags(behaviour) });
  if (!created.ok) {
    showToast({ tone: "error", title: "Could not create campaign", description: created.error });
    return null;
  }
  const id = String(created.data.id);
  showToast({ tone: "success", title: "Draft campaign created", description: "Opening the editor now." });
  router.push(`/autodialer/${encodeURIComponent(id)}?tab=edit`);
  return id;
}
