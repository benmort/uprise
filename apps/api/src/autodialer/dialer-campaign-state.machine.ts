import { DialerCampaignStatus } from "@uprise/db";
import { assertTransition, type TransitionMap } from "../common/fsm/assert-transition";

/**
 * Dialler campaign FSM. DRAFT is the editing state; ACTIVE is dialling (the
 * engine only ticks ACTIVE campaigns); PAUSED stops the ticks but keeps the
 * campaign editable and resumable; COMPLETED is terminal for dialling — the
 * source behaviour is clone-to-re-run, so re-activation is deliberately not a
 * legal edge; ARCHIVED hides the campaign from the default list.
 */
export const DIALER_CAMPAIGN_TRANSITIONS: TransitionMap<DialerCampaignStatus> = {
  [DialerCampaignStatus.DRAFT]: [DialerCampaignStatus.ACTIVE, DialerCampaignStatus.ARCHIVED],
  [DialerCampaignStatus.ACTIVE]: [
    DialerCampaignStatus.PAUSED,
    DialerCampaignStatus.COMPLETED,
    DialerCampaignStatus.ARCHIVED,
  ],
  [DialerCampaignStatus.PAUSED]: [
    DialerCampaignStatus.ACTIVE,
    DialerCampaignStatus.COMPLETED,
    DialerCampaignStatus.ARCHIVED,
  ],
  [DialerCampaignStatus.COMPLETED]: [DialerCampaignStatus.ARCHIVED],
  [DialerCampaignStatus.ARCHIVED]: [],
};

/** Command-path guard — throws 409 INVALID_DIALER_CAMPAIGN_TRANSITION. */
export function assertValidDialerCampaignTransition(
  from: DialerCampaignStatus,
  to: DialerCampaignStatus,
): void {
  assertTransition(
    DIALER_CAMPAIGN_TRANSITIONS,
    from,
    to,
    "INVALID_DIALER_CAMPAIGN_TRANSITION",
    "dialler campaign",
  );
}

/** Engine/webhook-path guard — non-throwing (an illegal transition is a no-op). */
export function canTransitionDialerCampaign(
  from: DialerCampaignStatus,
  to: DialerCampaignStatus,
): boolean {
  return DIALER_CAMPAIGN_TRANSITIONS[from]?.includes(to) ?? false;
}
