import { JourneyTriggerType } from "@uprise/db";

export const JOURNEY_TRIGGER_PORT = "JourneyTriggerPort";

export type JourneyTriggerPayload = {
  tenantId: string;
  contactId: string;
  code?: string; // disposition code
  questionId?: string;
  optionId?: string | null;
  tag?: string;
  blastId?: string | null;
};

/**
 * The single surface other domains (engagement, inbox, contacts) use to fire a
 * journey trigger. Provided under JOURNEY_TRIGGER_PORT by JourneysModule so
 * those modules depend on journeys one-way, with no module cycle.
 */
export interface JourneyTriggerPort {
  handleTrigger(type: JourneyTriggerType, payload: JourneyTriggerPayload): Promise<void>;
}
