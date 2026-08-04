/**
 * The widget-visible progress vocabulary — mirrors the API's
 * DIALER_PROGRESS_EVENTS (session-progress.service.ts). SSE named events need
 * explicit listeners per name, so the list lives client-side too; an unknown
 * name is simply never subscribed, which fails soft.
 */
export const DIALER_PROGRESS_EVENT_NAMES = [
  "call_started",
  "call_connected",
  "call_redirecting",
  "call_connected_conference",
  "call_target_hangup",
  "call_survey",
  "call_survey_result",
  "call_electoral_postcode",
  "call_electoral_lookup",
  "call_select_electorate",
  "call_electoral_target",
  "call_disconnected",
  "call_ended",
  "error",
] as const;

export type ProgressEvent = { name: string; payload?: Record<string, unknown> };
